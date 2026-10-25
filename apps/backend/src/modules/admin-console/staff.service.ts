import { HttpException, HttpStatus, Injectable } from '@nestjs/common'
import type { Prisma } from '@backend/db/generated/prisma/client'
import { DbService } from '@backend/db/db.service'
import type { AdminPrincipal } from './guards/admin-console.guard'
import type { ChangeStaffStatusDto } from './dto/change-staff-status.dto'
import type { CreateStaffDto } from './dto/create-staff.dto'
import type { UpdateStaffDto } from './dto/update-staff.dto'
import type { StaffErrorCode, StaffListDto, StaffRoleRef, StaffRowDto } from './dto/staff.types'
import { SimulationClock } from './simulation-clock'

/** Feature number written on every audit row this service creates. */
const SOURCE_FEATURE = '15'

/** Same rule as the Role access page (`ReplaceRoleScreensDto`), so every admin change asks for a real sentence. */
const MIN_REASON_LENGTH = 10

/**
 * The error shape the Staff & roles screen reads: `{ error: { code, message, details? } }`. The UI switches on `code`
 * to put the message under the right field or open the right dialog, so the code is the contract, not the text.
 */
export class StaffError extends HttpException {
  constructor(
    status: HttpStatus,
    readonly code: StaffErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super({ error: { code, message, ...(details ? { details } : {}) } }, status)
  }
}

const STAFF_SELECT = {
  id: true,
  user_id: true,
  staff_code: true,
  first_name: true,
  last_name: true,
  role_id: true,
  last_sign_in_at: true,
  created_at: true,
  user: { select: { email: true, clerk_user_id: true, disabled_at: true } },
  role: { select: { id: true, code: true, name: true, is_admin: true } },
} as const

interface StaffRecord {
  id: string
  user_id: string
  staff_code: string
  first_name: string
  last_name: string
  role_id: string
  last_sign_in_at: Date | null
  created_at: Date
  user: { email: string; clerk_user_id: string | null; disabled_at: Date | null }
  role: StaffRoleRef
}

function toRow(s: StaffRecord): StaffRowDto {
  return {
    id: s.id,
    user_id: s.user_id,
    staff_code: s.staff_code,
    first_name: s.first_name,
    last_name: s.last_name,
    email: s.user.email,
    role: s.role,
    active: s.user.disabled_at === null,
    claimed: s.user.clerk_user_id !== null,
    last_sign_in_at: s.last_sign_in_at ? s.last_sign_in_at.toISOString() : null,
    created_at: s.created_at.toISOString(),
  }
}

/** Matches the column default `'ST-' || lpad(nextval('staff_code_seq')::text, 4, '0')`. */
function formatStaffCode(n: number): string {
  return `ST-${String(n).padStart(4, '0')}`
}

function fullName(s: { first_name: string; last_name: string }): string {
  return `${s.first_name} ${s.last_name}`
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/** Prisma's unique-constraint error. Checked by code so this file never needs the generated client at runtime. */
function isUniqueViolation(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: unknown }).code === 'P2002'
}

function emailTaken(): StaffError {
  return new StaffError(HttpStatus.CONFLICT, 'EMAIL_TAKEN', 'This email is already used by another staff account.')
}

export function staffNotFound(): StaffError {
  return new StaffError(HttpStatus.NOT_FOUND, 'STAFF_NOT_FOUND', 'This staff account does not exist.')
}

function requireReason(reason: string, message: string): string {
  const trimmed = reason.trim()
  if (trimmed.length < MIN_REASON_LENGTH) {
    throw new StaffError(HttpStatus.BAD_REQUEST, 'REASON_REQUIRED', message, { min_length: MIN_REASON_LENGTH })
  }
  return trimmed
}

function requireName(first: string, last: string): { first_name: string; last_name: string } {
  const first_name = first.trim()
  const last_name = last.trim()
  if (!first_name || !last_name) {
    throw new StaffError(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', 'First name and last name are required.')
  }
  return { first_name, last_name }
}

/**
 * Staff accounts for the Staff & roles tab: list, create, edit (name, email, role in one request) and activate /
 * deactivate. Every write records its audit row in the same transaction, so the log never claims a change that did not
 * happen.
 *
 * Rules enforced here:
 *   - An admin cannot deactivate their own account (`SELF_DISABLE`) or change their own role (`SELF_ROLE_CHANGE`).
 *   - There is always at least one active admin (`LAST_ADMIN`). The check runs under the transaction-scoped advisory
 *     lock from the spec, so two admins switching each other off at the same moment cannot both succeed.
 *   - Emails are stored lowercase and unique; the email is locked once the account is claimed (`EMAIL_LOCKED`).
 *   - A save that changes nothing writes nothing (`NO_CHANGE`).
 *
 * Deactivating only sets `user.disabled_at`. The auth service already refuses sign-in and token refresh for a disabled
 * user, so the person is signed out when their current access token expires.
 */
@Injectable()
export class StaffService {
  constructor(
    private readonly db: DbService,
    private readonly clock: SimulationClock,
  ) {}

  async list(admin: AdminPrincipal): Promise<StaffListDto> {
    const [rows, next] = await Promise.all([
      this.db.staff.findMany({
        where: { deleted_at: null, user: { deleted_at: null } },
        orderBy: [{ staff_code: 'asc' }],
        select: STAFF_SELECT,
      }),
      this.peekNextStaffCode(),
    ])
    return { staff: rows.map(toRow), next_staff_code: next, viewer_staff_id: admin.staffId }
  }

  async create(admin: AdminPrincipal, dto: CreateStaffDto): Promise<StaffRowDto> {
    const name = requireName(dto.first_name, dto.last_name)
    const reason = requireReason(dto.reason, 'A reason is required before creating this account.')
    const email = normalizeEmail(dto.email)
    const role = await this.findRole(dto.role_id)
    await this.assertEmailFree(email)

    const occurredAt = this.clock.now()
    try {
      return await this.db.$transaction(async (tx) => {
        const user = await tx.user.create({ data: { type: 'staff', email }, select: { id: true } })
        const staff = await tx.staff.create({
          data: { user_id: user.id, first_name: name.first_name, last_name: name.last_name, role_id: role.id },
          select: STAFF_SELECT,
        })
        await tx.audit_log.create({
          data: {
            ...this.auditBase(admin, occurredAt, staff.id),
            action: 'create',
            summary: `Created staff account ${staff.staff_code} (${fullName(staff)}) as ${role.name}`,
            reason,
            after: { staff_code: staff.staff_code, ...name, email, role_code: role.code, active: true },
          },
        })
        return toRow(staff)
      })
    } catch (e) {
      if (isUniqueViolation(e)) throw emailTaken()
      throw e
    }
  }

  async update(admin: AdminPrincipal, staffId: string, dto: UpdateStaffDto): Promise<StaffRowDto> {
    const target = await this.findStaff(staffId)
    const name = requireName(dto.first_name, dto.last_name)
    const email = normalizeEmail(dto.email)

    const nameChanged = name.first_name !== target.first_name || name.last_name !== target.last_name
    const emailChanged = email !== target.user.email.toLowerCase()
    const roleChanged = dto.role_id !== target.role_id
    if (!nameChanged && !emailChanged && !roleChanged) {
      throw new StaffError(HttpStatus.BAD_REQUEST, 'NO_CHANGE', 'No account details changed. Nothing was saved or added to the audit log.')
    }
    if (roleChanged && target.user_id === admin.id) {
      throw new StaffError(
        HttpStatus.CONFLICT,
        'SELF_ROLE_CHANGE',
        "You can't change your own role. Ask another Admin to make this change. Nothing was saved.",
      )
    }
    const reason = requireReason(dto.reason, 'A reason is required before saving.')
    if (emailChanged) {
      if (target.user.clerk_user_id !== null) {
        throw new StaffError(
          HttpStatus.CONFLICT,
          'EMAIL_LOCKED',
          'This account was claimed at its first Clerk sign-in, so the work email can no longer be changed.',
        )
      }
      await this.assertEmailFree(email, target.user_id)
    }
    const newRole = roleChanged ? await this.findRole(dto.role_id) : target.role
    const leavesAdmin = roleChanged && target.role.is_admin && !newRole.is_admin && target.user.disabled_at === null

    const occurredAt = this.clock.now()
    try {
      return await this.db.$transaction(async (tx) => {
        if (leavesAdmin) await this.assertAnotherActiveAdmin(tx, target)
        if (emailChanged) {
          await tx.user.update({ where: { id: target.user_id }, data: { email, updated_at: new Date() } })
        }
        const updated = await tx.staff.update({
          where: { id: target.id },
          data: { ...name, role_id: newRole.id, updated_at: new Date() },
          select: STAFF_SELECT,
        })

        if (nameChanged || emailChanged) {
          const before: Record<string, string> = {}
          const after: Record<string, string> = {}
          if (nameChanged) {
            Object.assign(before, { first_name: target.first_name, last_name: target.last_name })
            Object.assign(after, name)
          }
          if (emailChanged) {
            before.email = target.user.email
            after.email = email
          }
          await tx.audit_log.create({
            data: {
              ...this.auditBase(admin, occurredAt, target.id),
              action: 'update',
              summary: `Updated ${Object.keys(after).join(', ')} of staff account ${target.staff_code}`,
              reason,
              before,
              after,
            },
          })
        }
        if (roleChanged) {
          await tx.audit_log.create({
            data: {
              ...this.auditBase(admin, occurredAt, target.id),
              action: 'role_change',
              summary: `Changed role of ${target.staff_code} (${fullName(updated)}) from ${target.role.name} to ${newRole.name}`,
              reason,
              before: { role_code: target.role.code },
              after: { role_code: newRole.code },
            },
          })
        }
        return toRow(updated)
      })
    } catch (e) {
      if (isUniqueViolation(e)) throw emailTaken()
      throw e
    }
  }

  async setStatus(admin: AdminPrincipal, staffId: string, dto: ChangeStaffStatusDto): Promise<StaffRowDto> {
    const target = await this.findStaff(staffId)
    if (!dto.active && target.user_id === admin.id) {
      throw new StaffError(
        HttpStatus.CONFLICT,
        'SELF_DISABLE',
        "You can't deactivate your own account. Ask another Admin to do it. This stops an Admin locking themselves out.",
      )
    }
    const wasActive = target.user.disabled_at === null
    if (wasActive === dto.active) {
      throw new StaffError(
        HttpStatus.BAD_REQUEST,
        'NO_CHANGE',
        dto.active ? 'This account is already active. Nothing was saved.' : 'This account is already inactive. Nothing was saved.',
      )
    }
    const reason = requireReason(
      dto.reason,
      dto.active ? 'A reason is required before activating this account.' : 'A reason is required before deactivating this account.',
    )

    const occurredAt = this.clock.now()
    return this.db.$transaction(async (tx) => {
      if (!dto.active && target.role.is_admin) await this.assertAnotherActiveAdmin(tx, target)
      await tx.user.update({
        where: { id: target.user_id },
        data: { disabled_at: dto.active ? null : occurredAt, updated_at: new Date() },
      })
      const updated = await tx.staff.findUniqueOrThrow({ where: { id: target.id }, select: STAFF_SELECT })
      await tx.audit_log.create({
        data: {
          ...this.auditBase(admin, occurredAt, target.id),
          action: 'status_change',
          summary: `${dto.active ? 'Activated' : 'Deactivated'} staff account ${target.staff_code} (${fullName(target)})`,
          reason,
          before: { active: wasActive },
          after: { active: dto.active },
        },
      })
      return toRow(updated)
    })
  }

  /* ──────────────────────────────────────────────────────────────────────────── */
  /*  Helpers */
  /* ──────────────────────────────────────────────────────────────────────────── */

  private auditBase(admin: AdminPrincipal, occurredAt: Date, staffId: string) {
    return {
      occurred_at: occurredAt,
      actor_type: 'staff',
      actor_id: admin.id,
      actor_role: admin.roleCode,
      source_feature: SOURCE_FEATURE,
      entity_type: 'staff',
      entity_id: staffId,
      is_sensitive: false,
    }
  }

  private async findStaff(staffId: string): Promise<StaffRecord> {
    const staff = await this.db.staff.findFirst({
      where: { id: staffId, deleted_at: null, user: { deleted_at: null } },
      select: STAFF_SELECT,
    })
    if (!staff) throw staffNotFound()
    return staff
  }

  private async findRole(roleId: string): Promise<StaffRoleRef> {
    const role = await this.db.role.findUnique({
      where: { id: roleId },
      select: { id: true, code: true, name: true, is_admin: true },
    })
    if (!role) throw new StaffError(HttpStatus.BAD_REQUEST, 'ROLE_NOT_FOUND', 'The selected role does not exist.')
    return role
  }

  /** Early, friendly check. The unique index on `(type, lower(email))` is still the real guard (caught as P2002). */
  private async assertEmailFree(email: string, exceptUserId?: string): Promise<void> {
    const clash = await this.db.user.findFirst({
      where: {
        type: 'staff',
        deleted_at: null,
        email: { equals: email, mode: 'insensitive' },
        ...(exceptUserId ? { id: { not: exceptUserId } } : {}),
      },
      select: { id: true },
    })
    if (clash) throw emailTaken()
  }

  /**
   * Serialises every change that could remove an active admin (spec: `active_admin_guard`), then makes sure someone
   * other than `target` stays an active admin. Must run inside the transaction that makes the change, so the lock is
   * held until commit and the count sees every admin change committed before it.
   */
  private async assertAnotherActiveAdmin(tx: Prisma.TransactionClient, target: StaffRecord): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('active_admin_guard', 0))`
    const others = await tx.staff.count({
      where: {
        id: { not: target.id },
        deleted_at: null,
        role: { is_admin: true },
        user: { disabled_at: null, deleted_at: null },
      },
    })
    if (others === 0) {
      throw new StaffError(
        HttpStatus.CONFLICT,
        'LAST_ADMIN',
        `${fullName(target)} is the last active Admin, so this change would leave no active Admin. Nothing was changed.`,
      )
    }
  }

  /**
   * Reads `staff_code_seq` without calling `nextval`, so opening the Create dialog never burns a number. `is_called` is
   * false only before the first `nextval`, when `last_value` itself is the next value.
   */
  private async peekNextStaffCode(): Promise<string> {
    const rows = await this.db.$queryRaw<{ last_value: bigint | number; is_called: boolean }[]>`
      SELECT last_value, is_called FROM staff_code_seq`
    const row = rows[0]
    if (!row) return formatStaffCode(1)
    const last = Number(row.last_value)
    return formatStaffCode(row.is_called ? last + 1 : last)
  }
}

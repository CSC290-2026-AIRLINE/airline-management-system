import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import type { Prisma } from '@backend/db/generated/prisma/client'
import { DbService } from '@backend/db/db.service'
import type {
  AuditEntryDto,
  AuditPage,
  MyScreensDto,
  ReplaceRoleScreensResult,
  RoleScreensDto,
  RoleSummary,
  ScreenDto,
  ScreenGroup,
} from './dto/admin-console.types'
import type { AuditQueryDto } from './dto/audit-query.dto'
import type { RegisterScreenDto } from './dto/register-screen.dto'
import type { ScreenKind } from './dto/register-screen.dto'
import type { SelfRegisterScreen } from './dto/admin-console.types'
import type { AdminPrincipal } from './guards/admin-console.guard'
import { SimulationClock } from './simulation-clock'

const DEFAULT_AUDIT_LIMIT = 50
const MAX_AUDIT_LIMIT = 200

/** Feature number written on every audit row this module creates. Mirrors `SOURCE_FEATURE` in the self-registration. */
const SOURCE_FEATURE = '15'

/** Mirrors `ReplaceRoleScreensDto`'s `MinLength`. Re-checked in the service so non-HTTP callers are covered too. */
const MIN_REASON_LENGTH = 10

/** Order-insensitive set comparison — the caller's ordering carries no meaning, only membership does. */
function sameIds(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const set = new Set(a)
  return b.every((id) => set.has(id))
}

/**
 * All admin-console queries, plus the one write path (`replaceRoleScreens`).
 *
 * Invariants enforced here (NOT elsewhere):
 * 1. Sensitive masking: if `is_sensitive` is set on an audit row, `before`/`after` come back as `null` in the list.
 *    The list endpoint never reveals them. The create-time writer is the only place that decides what is sensitive.
 * 2. `seq` BigInt → decimal-string mapping at the response boundary (see BigInt note below).
 * 3. BigInt `toJSON` is missing on the global; `JSON.stringify(seq: 1n)` throws. Service maps to string here so the
 *    controller can return raw objects.
 *
 * Note on BigInt indexes: `audit_log.seq` is `@unique BigInt @default(autoincrement())`, so it has an implicit btree.
 * Paging by `seq DESC` uses that index, even though `audit_log_occurred_idx` (which leads with occurred_at) is the
 * declared `WHERE` index. Do not be tempted to add a redundant `@index` on `seq` — the unique one already serves.
 */
@Injectable()
export class AdminConsoleService {
  constructor(
    private readonly db: DbService,
    private readonly clock: SimulationClock,
  ) {}

  /* ──────────────────────────────────────────────────────────────────────────── */
  /*  Self-registration (called by OnModuleInit and by POST /admin/screens) */
  /* ──────────────────────────────────────────────────────────────────────────── */

  /**
   * Idempotent on `code`. Never updates `kind` once set — `kind` only changes by an out-of-band migration, and
   * touching it here could violate the composite FK `role_screen.screen_kind = screen.kind` if any rows already
   * reference the screen.
   */
  async registerScreen(dto: RegisterScreenDto & { feature_no: string }): Promise<ScreenDto> {
    const upserted = await this.db.screen.upsert({
      where: { code: dto.code },
      create: {
        code: dto.code,
        name: dto.name,
        kind: dto.kind ?? 'assignable',
        feature_no: dto.feature_no,
      },
      // Empty `update` is intentional: see JSDoc above. To change `kind`, hand-edit the DB.
      update: {},
      select: {
        id: true,
        feature_no: true,
        code: true,
        name: true,
        kind: true,
        is_active: true,
      },
    })
    return {
      id: upserted.id,
      feature_no: upserted.feature_no,
      code: upserted.code,
      name: upserted.name,
      kind: upserted.kind as ScreenDto['kind'],
      is_active: upserted.is_active,
    }
  }

  /** Bulk variant called by `OnModuleInit` — keeps module startup deterministic. */
  async registerSelfScreens(screens: SelfRegisterScreen[]): Promise<void> {
    for (const s of screens) {
      await this.registerScreen({ code: s.code, name: s.name, kind: s.kind, feature_no: s.feature_no })
    }
  }

  /* ──────────────────────────────────────────────────────────────────────────── */
  /*  Screen listing (for the Role access matrix) */
  /* ──────────────────────────────────────────────────────────────────────────── */

  /**
   * Returns active screens grouped by `feature_no`, sorted within each group by `code`. Returned shape is exactly
   * what the Role access UI consumes; the controller wraps it in `{ groups }`.
   */
  async listScreens(): Promise<ScreenGroup[]> {
    const rows = await this.db.screen.findMany({
      where: { is_active: true },
      orderBy: [{ feature_no: 'asc' }, { code: 'asc' }],
      select: {
        id: true,
        feature_no: true,
        code: true,
        name: true,
        kind: true,
        is_active: true,
      },
    })

    const groupsByFeature = new Map<string, ScreenDto[]>()
    for (const row of rows) {
      const list = groupsByFeature.get(row.feature_no) ?? []
      list.push({
        id: row.id,
        feature_no: row.feature_no,
        code: row.code,
        name: row.name,
        kind: row.kind as ScreenDto['kind'],
        is_active: row.is_active,
      })
      groupsByFeature.set(row.feature_no, list)
    }
    return Array.from(groupsByFeature.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([feature_no, screens]) => ({
        feature_no,
        // Sort within each group so the UI render is DB-order-independent. Prisma's orderBy covers the cross-group
        // ordering; this is the within-group final ordering.
        screens: [...screens].sort((a, b) => a.code.localeCompare(b.code)),
      }))
  }

  /* ──────────────────────────────────────────────────────────────────────────── */
  /*  Role listing (for the role <select> in Role access, plus the staff count) */
  /* ──────────────────────────────────────────────────────────────────────────── */

  async listRoles(): Promise<RoleSummary[]> {
    // Two queries instead of Prisma `include` + `_count` so the SQL is predictable; the staff table is small.
    const [roles, counts] = await Promise.all([
      this.db.role.findMany({
        orderBy: [{ is_admin: 'desc' }, { code: 'asc' }],
        select: { id: true, code: true, name: true, is_admin: true },
      }),
      this.db.staff.groupBy({
        by: ['role_id'],
        where: { deleted_at: null },
        _count: { _all: true },
      }),
    ])

    const staffCountByRole = new Map<string, number>()
    for (const c of counts) {
      staffCountByRole.set(c.role_id, c._count._all)
    }

    return roles.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      is_admin: r.is_admin,
      staff_count: staffCountByRole.get(r.id) ?? 0,
    }))
  }

  /* ──────────────────────────────────────────────────────────────────────────── */
  /*  Per-role granted screens (for the Role access matrix) */
  /* ──────────────────────────────────────────────────────────────────────────── */

  async getRoleScreens(roleId: string): Promise<RoleScreensDto | null> {
    const role = await this.db.role.findUnique({ where: { id: roleId }, select: { id: true } })
    if (!role) return null
    const grants = await this.db.role_screen.findMany({
      where: { role_id: roleId },
      orderBy: [{ screen_id: 'asc' }],
      select: { screen_id: true },
    })
    return { role_id: roleId, screen_ids: grants.map((g) => g.screen_id) }
  }

  /* ──────────────────────────────────────────────────────────────────────────── */
  /*  Full replace of a role's grants (PUT /admin/roles/:id/screens)
  /* ──────────────────────────────────────────────────────────────────────────── */

  /**
   * Replaces every `role_screen` grant on `roleId` with `screenIds`, and records the change in `audit_log` inside the
   * same transaction. A partial write would leave the log claiming a change that did not happen (or the reverse), so
   * both halves commit or neither does.
   *
   * Invariants this enforces:
   *   1. **Only `assignable` screens may be granted.** `role_screen` has a composite FK on `(screen_id, screen_kind)`
   *      and `schema.sql` adds `CHECK (screen_kind = 'assignable')`; filtering here turns what would be a 500 from
   *      Postgres into a 400 that names the offending ids. Core and admin screens are implicitly held by every role
   *      (or by admin roles) — see `getMyScreens` — so granting them would be meaningless anyway.
   *   2. **`actor_id` comes from the token, never the body.** An admin cannot forge who made a change.
   *   3. **`recorded_at` is never set** — the DB default `now()` is what keeps real time real even if the simulation
   *      clock is later rewound. Only `occurred_at` (business time) comes from `SimulationClock`.
   */
  async replaceRoleScreens(admin: AdminPrincipal, roleId: string, screenIds: string[], reason: string): Promise<ReplaceRoleScreensResult> {
    // Defence for non-HTTP callers (tests, future internal callers): the DTO guards the HTTP path only.
    const trimmedReason = reason.trim()
    if (trimmedReason.length < MIN_REASON_LENGTH) {
      throw new BadRequestException(`reason must be at least ${MIN_REASON_LENGTH} characters`)
    }

    const role = await this.db.role.findUnique({ where: { id: roleId }, select: { id: true, code: true } })
    if (!role) {
      throw new NotFoundException(`Role ${roleId} not found`)
    }

    // De-duplicate before comparing, so a client that sends the same id twice gets the same result as one that does
    // not — otherwise `changed` would flip on every save.
    const wanted = [...new Set(screenIds)]
    const before = await this.db.role_screen.findMany({
      where: { role_id: roleId },
      orderBy: [{ screen_id: 'asc' }],
      select: { screen_id: true },
    })
    const beforeIds = before.map((g) => g.screen_id)
    const unchanged = sameIds(beforeIds, wanted)
    if (unchanged) {
      // Nothing to write, so there is nothing to audit. Returning early also keeps a no-op save from appending a row
      // to the audit log every time somebody clicks Save twice.
      return { role_id: roleId, screen_ids: beforeIds, changed: false }
    }

    // An empty list is legal (revoke everything) and must not hit the lookup at all.
    if (wanted.length > 0) {
      const found = await this.db.screen.findMany({
        where: { id: { in: wanted }, kind: 'assignable', is_active: true },
        select: { id: true },
      })
      const foundIds = new Set(found.map((s) => s.id))
      const rejected = wanted.filter((id) => !foundIds.has(id))
      if (rejected.length > 0) {
        throw new BadRequestException(
          `Only active assignable screens can be granted; rejected ${rejected.length} id(s): ${rejected.slice(0, 5).join(', ')}`,
        )
      }
    }

    const occurredAt = this.clock.now()
    const inserted = await this.db.$transaction(async (tx) => {
      await tx.role_screen.deleteMany({ where: { role_id: roleId } })
      if (wanted.length > 0) {
        await tx.role_screen.createMany({
          data: wanted.map((screenId) => ({ role_id: roleId, screen_id: screenId, screen_kind: 'assignable' })),
          // `role_id + screen_id` is the composite primary key; `wanted` is already de-duplicated so skipIfDuplicates
          // would never fire, but leaving it off keeps a future caller from tripping the PK on a retry.
          skipDuplicates: true,
        })
      }

      const audit = await tx.audit_log.create({
        data: {
          occurred_at: occurredAt,
          actor_type: 'staff',
          actor_id: admin.id,
          actor_role: admin.roleCode,
          source_feature: SOURCE_FEATURE,
          action: 'screen_access_change',
          entity_type: 'role',
          entity_id: roleId,
          summary: `Replaced screen access for role ${role.code}: ${beforeIds.length} → ${wanted.length} screen(s)`,
          reason: trimmedReason,
          before: { screen_ids: beforeIds },
          after: { screen_ids: wanted },
          is_sensitive: false,
        },
        select: { seq: true },
      })
      return audit
    })

    return { role_id: roleId, screen_ids: [...wanted].sort(), changed: true, audit_seq: inserted.seq.toString() }
  }

  /* ──────────────────────────────────────────────────────────────────────────── */
  /*  Audit log (read) */
  /* ──────────────────────────────────────────────────────────────────────────── */

  /**
   * One audit entry by id, used by `GET /admin/audit-log/:id`. Returns `null` when no such row — the controller turns
   * that into a 404. Sensitive-masking rules match `listAudit`: the `before`/`after` payloads are hidden when
   * `is_sensitive` is true, regardless of who is asking. (Admin role does not unmask sensitive rows.)
   */
  async getAuditEntry(id: string): Promise<AuditEntryDto | null> {
    const row = await this.db.audit_log.findUnique({
      where: { id },
      select: {
        id: true,
        seq: true,
        occurred_at: true,
        recorded_at: true,
        actor_type: true,
        actor_id: true,
        actor_role: true,
        source_feature: true,
        action: true,
        entity_type: true,
        entity_id: true,
        summary: true,
        reason: true,
        before: true,
        after: true,
        is_sensitive: true,
      },
    })
    if (!row) return null
    const actor = (await this.actorNames([row])).get(row.actor_id ?? '')
    return {
      seq: row.seq.toString(),
      id: row.id,
      occurred_at: row.occurred_at.toISOString(),
      recorded_at: row.recorded_at.toISOString(),
      actor_type: row.actor_type as AuditEntryDto['actor_type'],
      actor_id: row.actor_id,
      actor_role: row.actor_role,
      actor_name: actor?.name ?? null,
      actor_role_name: actor?.role ?? null,
      source_feature: row.source_feature,
      action: row.action,
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      summary: row.summary,
      reason: row.reason,
      before: row.is_sensitive ? null : row.before,
      after: row.is_sensitive ? null : row.after,
      is_sensitive: row.is_sensitive,
    }
  }

  async listAudit(query: AuditQueryDto): Promise<AuditPage> {
    // Defence for non-HTTP callers (tests, future internal callers): the DTO already caps at 200, so this clamp is
    // only effective when the DTO isn't used.
    const limit = Math.min(Math.max(query.limit ?? DEFAULT_AUDIT_LIMIT, 1), MAX_AUDIT_LIMIT)

    const where: Prisma.audit_logWhereInput = {}
    if (query.source_feature !== undefined) where.source_feature = query.source_feature
    if (query.actor_type !== undefined) where.actor_type = query.actor_type
    if (query.actor_id !== undefined) where.actor_id = query.actor_id
    if (query.action !== undefined) where.action = query.action
    if (query.from !== undefined || query.to !== undefined) {
      where.occurred_at = {
        ...(query.from !== undefined ? { gte: new Date(query.from) } : {}),
        ...(query.to !== undefined ? { lte: new Date(query.to) } : {}),
      }
    }
    if (query.cursor !== undefined) {
      // `seq` is UNIQUE, so this is a total order and `seq < cursor` is exactly "next page after cursor", with no skip.
      where.seq = { lt: BigInt(query.cursor) }
    }

    const rows = await this.db.audit_log.findMany({
      where,
      orderBy: [{ seq: 'desc' }],
      // `take: limit + 1` lets us tell if another page exists without a second COUNT.
      take: limit + 1,
      select: {
        id: true,
        seq: true,
        occurred_at: true,
        recorded_at: true,
        actor_type: true,
        actor_id: true,
        actor_role: true,
        source_feature: true,
        action: true,
        entity_type: true,
        entity_id: true,
        summary: true,
        reason: true,
        before: true,
        after: true,
        is_sensitive: true,
      },
    })

    const hasMore = rows.length > limit
    const page = hasMore ? rows.slice(0, limit) : rows
    const actors = await this.actorNames(page)

    const items: AuditEntryDto[] = page.map((row) => ({
      seq: row.seq.toString(),
      id: row.id,
      occurred_at: row.occurred_at.toISOString(),
      recorded_at: row.recorded_at.toISOString(),
      actor_type: row.actor_type as AuditEntryDto['actor_type'],
      actor_id: row.actor_id,
      actor_role: row.actor_role,
      actor_name: actors.get(row.actor_id ?? '')?.name ?? null,
      actor_role_name: actors.get(row.actor_id ?? '')?.role ?? null,
      source_feature: row.source_feature,
      action: row.action,
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      summary: row.summary,
      reason: row.reason,
      // schema.sql: "before/after are masked by the writer; list views hide them".
      before: row.is_sensitive ? null : (row.before as unknown),
      after: row.is_sensitive ? null : (row.after as unknown),
      is_sensitive: row.is_sensitive,
    }))

    return {
      items,
      next_cursor: hasMore ? items[items.length - 1].seq : null,
      has_more: hasMore,
    }
  }

  /* ──────────────────────────────────────────────────────────────────────────── */
  /*  Self-service: which screens can the signed-in user open? */
  /* ──────────────────────────────────────────────────────────────────────────── */

  /**
   * Returns the codes of every active screen the signed-in user can open. Used by `GET /me/screens` so each feature
   * (gate agent, finance, etc.) can filter its own nav. Policy:
   *
   *   - Every active `core` screen — these are always-on for everyone (e.g. Home, My profile).
   *   - Every active `admin` screen — only if the user's role is `is_admin`.
   *   - Every active `assignable` screen the role has a `role_screen` grant for.
   *
   * `provisioned` is the signal that separates "signed in, but nobody created a staff account yet" from "has a staff
   * account whose role happens to hold no screens" — both produce an empty `screen_codes`, and only the former should
   * send the user to the "ask an Admin" screen.
   *
   * Anonymous calls (no `staff` row linked to the token) come back `provisioned: false`. We never throw 403 here — the
   * global `JwtAuthGuard` already rejected unauthenticated requests before reaching us.
   */
  async getMyScreens(userId: string): Promise<MyScreensDto> {
    const staff = await this.db.staff.findFirst({
      where: { user_id: userId, deleted_at: null },
      select: { role_id: true, role: { select: { is_admin: true } } },
    })
    if (!staff) return { screen_codes: [], provisioned: false }

    const grants = await this.db.role_screen.findMany({
      where: { role_id: staff.role_id },
      select: { screen_id: true },
    })

    const wantedKinds: ScreenKind[] = staff.role.is_admin ? ['core', 'admin'] : ['core']
    const allowedAuto = await this.db.screen.findMany({
      where: { is_active: true, kind: { in: wantedKinds } },
      select: { code: true },
    })

    if (grants.length === 0) {
      return { screen_codes: allowedAuto.map((s) => s.code), provisioned: true }
    }

    const allowedGranted = await this.db.screen.findMany({
      where: { id: { in: grants.map((g) => g.screen_id) }, is_active: true },
      select: { code: true },
    })

    const codes = new Set<string>()
    for (const s of allowedAuto) codes.add(s.code)
    for (const s of allowedGranted) codes.add(s.code)
    return { screen_codes: [...codes], provisioned: true }
  }

  /**
   * Who the actors on one page of audit rows are, for the "Actor / Role" column: the staff member's name and current
   * role name, or the customer's passenger name. One query for the whole page rather than one per row. An actor whose
   * user row is gone (or a system row) is simply missing from the map; the page then falls back to the id.
   */
  private async actorNames(rows: { actor_id: string | null }[]): Promise<Map<string, { name: string; role: string | null }>> {
    const ids = [...new Set(rows.map((r) => r.actor_id).filter((id): id is string => !!id))]
    if (ids.length === 0) return new Map()
    const users = await this.db.user.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        type: true,
        email: true,
        staff: { select: { first_name: true, last_name: true, role: { select: { name: true } } }, take: 1 },
        customer: { select: { passenger: { select: { first_name: true, last_name: true } } }, take: 1 },
      },
    })
    const out = new Map<string, { name: string; role: string | null }>()
    for (const u of users) {
      const staff = u.staff[0]
      const passenger = u.customer[0]?.passenger
      if (staff) out.set(u.id, { name: `${staff.first_name} ${staff.last_name}`.trim(), role: staff.role.name })
      else if (passenger) out.set(u.id, { name: `${passenger.first_name} ${passenger.last_name}`.trim(), role: 'Customer' })
      else out.set(u.id, { name: u.email, role: u.type === 'customer' ? 'Customer' : 'Unknown user' })
    }
    return out
  }
}

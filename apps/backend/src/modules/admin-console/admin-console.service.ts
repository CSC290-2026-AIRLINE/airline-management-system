import { HttpStatus, Injectable, Logger } from '@nestjs/common'
import type { Prisma } from '@backend/db/generated/prisma/client'
import { DbService } from '@backend/db/db.service'
import type {
  AuditEntryDto,
  AuditPage,
  MyScreensDto,
  RegisterScreenResult,
  ReplaceRoleScreensResult,
  RoleScreensDto,
  RoleSummary,
  ScreenDto,
  ScreenGroup,
  StaffScreensDto,
} from './dto/admin-console.types'
import { DATE_ONLY, type AuditQueryDto } from './dto/audit-query.dto'
import type { RegisterScreenDto, RegisterScreenRequestDto } from './dto/register-screen.dto'
import type { ScreenKind } from './dto/register-screen.dto'
import type { SelfRegisterScreen } from './dto/admin-console.types'
import type { AdminPrincipal } from './guards/admin-console.guard'
import { AdminError, auditEntryNotFound, roleNotFound } from './admin-error'
import { AuditService, maskValue, sensitiveKeySet, stableAuditId } from './audit/audit.service'
import { staffNotFound } from './staff.service'
import { SimulationClock } from './simulation-clock'

const DEFAULT_AUDIT_LIMIT = 50
const MAX_AUDIT_LIMIT = 200

/** Feature number written on every audit row this module creates. Mirrors `SOURCE_FEATURE` in the self-registration. */
const SOURCE_FEATURE = '15'

/** Mirrors `ReplaceRoleScreensDto`'s `MinLength`. Re-checked in the service so non-HTTP callers are covered too. */
const MIN_REASON_LENGTH = 10

/**
 * A plain date in the audit filters (`to=2026-11-01`) means a whole day in Thailand, where the airline runs. Thailand
 * has no daylight saving time, so a fixed UTC+7 is exact. The staff web sends instants for the viewer's own day instead.
 */
const AUDIT_DAY_UTC_OFFSET_MINUTES = 7 * 60

/** Start of a `YYYY-MM-DD` day in Thailand time, as an instant; `addDays` moves it by whole days. */
function thaiDayStart(date: string, addDays = 0): Date {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + addDays) - AUDIT_DAY_UTC_OFFSET_MINUTES * 60_000)
}

/** How long one admin opening one sensitive entry counts as one view (and one `view_sensitive` row). */
const SENSITIVE_VIEW_WINDOW_MS = 60_000

/** Screen columns every screen query here reads. */
const SCREEN_SELECT = { id: true, feature_no: true, code: true, name: true, kind: true, is_active: true } as const

function toScreenDto(row: { id: string; feature_no: string; code: string; name: string; kind: string; is_active: boolean }): ScreenDto {
  return { ...row, kind: row.kind as ScreenKind }
}

/** `f05.refunds` → `f05`, `core.home` → `core`: the part of a code that says which feature owns the screen. */
function codePrefix(code: string): string {
  const dot = code.indexOf('.')
  return dot === -1 ? code : code.slice(0, dot)
}

/**
 * Fallback `feature_no` for a screen registered without one. The code convention is `f<feature_no>.<snake_name>`; the
 * prefix is used, or `'1'` (platform) when there is none.
 */
export function deriveFeatureNo(code: string): string {
  const m = /^f(\d+[a-z]?)\./.exec(code)
  return m && m[1] ? m[1] : '1'
}

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
  private readonly logger = new Logger(AdminConsoleService.name)

  constructor(
    private readonly db: DbService,
    private readonly clock: SimulationClock,
    private readonly audit: AuditService,
  ) {}

  /* ──────────────────────────────────────────────────────────────────────────── */
  /*  Screen registry: features at boot (registerSelfScreens), admins by hand (POST /admin/screens) */
  /* ──────────────────────────────────────────────────────────────────────────── */

  /**
   * Adds the screen, or brings an existing one up to date: its name and `feature_no` follow the caller, and a screen
   * that was turned off is turned back on. `kind` is never changed once set — the composite FK
   * `role_screen.(screen_id, screen_kind)` would break for a screen that roles already hold — so a different `kind` is
   * logged and ignored; changing it is a migration.
   */
  async registerScreen(dto: RegisterScreenDto & { feature_no: string }): Promise<ScreenDto> {
    return (await this.syncScreen(dto)).screen
  }

  private async syncScreen(
    dto: RegisterScreenDto & { feature_no: string },
    tx: Prisma.TransactionClient | DbService = this.db,
  ): Promise<{ screen: ScreenDto; before: ScreenDto | null; changed: boolean }> {
    const name = dto.name.trim()
    const existing = await tx.screen.findUnique({ where: { code: dto.code }, select: SCREEN_SELECT })
    if (!existing) {
      const created = await tx.screen.create({
        data: { code: dto.code, name, kind: dto.kind ?? 'assignable', feature_no: dto.feature_no },
        select: SCREEN_SELECT,
      })
      return { screen: toScreenDto(created), before: null, changed: true }
    }
    if (dto.kind && dto.kind !== existing.kind) {
      this.logger.warn(`Screen ${dto.code} is registered as ${dto.kind} but stored as ${existing.kind}; kind is left unchanged`)
    }
    const before = toScreenDto(existing)
    if (existing.name === name && existing.feature_no === dto.feature_no && existing.is_active) {
      return { screen: before, before, changed: false }
    }
    const updated = await tx.screen.update({
      where: { id: existing.id },
      data: { name, feature_no: dto.feature_no, is_active: true, updated_at: new Date() },
      select: SCREEN_SELECT,
    })
    return { screen: toScreenDto(updated), before, changed: true }
  }

  /**
   * Called by each feature's `OnModuleInit` with the full list of its screens. Brings the registry in line with that
   * list: new screens are added, renamed ones take the new name, and a screen the feature no longer lists is turned off
   * (`is_active = false`), which takes it off every menu and out of the Role access matrix. Rows are never deleted, so
   * `role_screen` grants and old audit rows keep pointing at a real screen.
   *
   * "The feature's screens" means every screen whose code starts with the same prefix as one in the list (`f05.` for
   * `f05.refunds`), so pass all of a feature's screens in one call — a screen left out of the call is turned off.
   * Every change is written to the audit log as the system.
   */
  async registerSelfScreens(screens: SelfRegisterScreen[]): Promise<void> {
    const listed = new Set(screens.map((s) => s.code))
    const changes: { before: ScreenDto | null; after: ScreenDto }[] = []
    for (const s of screens) {
      const result = await this.syncScreen({ code: s.code, name: s.name, kind: s.kind, feature_no: s.feature_no })
      if (result.changed) changes.push({ before: result.before, after: result.screen })
    }

    const prefixes = [...new Set(screens.map((s) => codePrefix(s.code)))]
    if (prefixes.length > 0) {
      const stale = await this.db.screen.findMany({
        where: { is_active: true, OR: prefixes.map((p) => ({ code: { startsWith: `${p}.` } })) },
        select: SCREEN_SELECT,
      })
      for (const row of stale.filter((r) => !listed.has(r.code))) {
        const after = await this.db.screen.update({
          where: { id: row.id },
          data: { is_active: false, updated_at: new Date() },
          select: SCREEN_SELECT,
        })
        changes.push({ before: toScreenDto(row), after: toScreenDto(after) })
      }
    }

    for (const { before, after } of changes) {
      const what = !before
        ? `Registered screen ${after.name} (${after.code})`
        : !after.is_active
          ? `Turned off screen ${after.name} (${after.code}): its feature no longer lists it`
          : !before.is_active
            ? `Turned screen ${after.name} (${after.code}) back on`
            : `Updated screen ${after.code}: ${before.name} → ${after.name}`
      await this.audit.tryWrite({
        actor: AuditService.systemActor(),
        sourceFeature: SOURCE_FEATURE,
        action: before ? 'update' : 'create',
        entityType: 'screen',
        entityId: after.id,
        summary: what,
        reason: 'Screen registry synced at startup',
        ...(before ? { before: { name: before.name, feature_no: before.feature_no, is_active: before.is_active } } : {}),
        after: { name: after.name, feature_no: after.feature_no, is_active: after.is_active },
      })
    }
  }

  /**
   * `POST /admin/screens`: an admin adds or renames one assignable screen. A `core` or `admin` screen with the same code
   * is refused (`SCREEN_KIND_CONFLICT`) — those belong to code, not to a request. The change and its audit row commit
   * together; a request that changes nothing writes nothing.
   */
  async registerScreenByAdmin(admin: AdminPrincipal, dto: RegisterScreenRequestDto): Promise<RegisterScreenResult> {
    const reason = this.requireReason(dto.reason)
    const name = dto.name.trim()
    if (!name) {
      throw new AdminError(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', 'The screen needs a name.', {
        fields: { name: ['name should not be empty'] },
      })
    }
    const feature_no = dto.feature_no ?? deriveFeatureNo(dto.code)

    return this.db.$transaction(async (tx) => {
      const existing = await tx.screen.findUnique({ where: { code: dto.code }, select: { kind: true } })
      if (existing && existing.kind !== 'assignable') {
        throw new AdminError(
          HttpStatus.CONFLICT,
          'SCREEN_KIND_CONFLICT',
          `${dto.code} is a ${existing.kind} screen. Only assignable screens can be changed here.`,
        )
      }
      const result = await this.syncScreen({ code: dto.code, name, kind: 'assignable', feature_no }, tx)
      if (!result.changed) return { ok: true, changed: false, screen: result.screen }

      const audit = await this.audit.write(
        {
          actor: AuditService.staffActor(admin),
          sourceFeature: SOURCE_FEATURE,
          action: result.before ? 'update' : 'create',
          entityType: 'screen',
          entityId: result.screen.id,
          summary: result.before
            ? `Updated screen ${result.screen.code}: ${result.before.name} → ${result.screen.name}`
            : `Registered screen ${result.screen.name} (${result.screen.code})`,
          reason,
          ...(result.before
            ? { before: { name: result.before.name, feature_no: result.before.feature_no, is_active: result.before.is_active } }
            : {}),
          after: { name: result.screen.name, feature_no: result.screen.feature_no, is_active: result.screen.is_active },
        },
        tx,
      )
      return { ok: true, changed: true, screen: result.screen, audit_seq: audit.seq }
    })
  }

  private requireReason(reason: string): string {
    const trimmed = (reason ?? '').trim()
    if (trimmed.length < MIN_REASON_LENGTH) {
      throw new AdminError(HttpStatus.BAD_REQUEST, 'REASON_REQUIRED', `A reason of at least ${MIN_REASON_LENGTH} characters is required.`, {
        min_length: MIN_REASON_LENGTH,
      })
    }
    return trimmed
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

  /**
   * The role's grants on screens that are still active. A grant on a screen that was turned off stays in `role_screen`
   * (it comes back if the screen does) but is not shown, so the matrix only ever lists what the role can open.
   * `ROLE_NOT_FOUND` (404) when the role does not exist.
   */
  async getRoleScreens(roleId: string): Promise<RoleScreensDto> {
    const role = await this.db.role.findUnique({ where: { id: roleId }, select: { id: true } })
    if (!role) throw roleNotFound()
    return { role_id: roleId, screen_ids: await this.activeGrantIds(this.db, roleId) }
  }

  private async activeGrantIds(client: Prisma.TransactionClient | DbService, roleId: string): Promise<string[]> {
    const grants = await client.role_screen.findMany({
      where: { role_id: roleId, screen: { is_active: true } },
      orderBy: [{ screen_id: 'asc' }],
      select: { screen_id: true },
    })
    return grants.map((g) => g.screen_id)
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
    const trimmedReason = this.requireReason(reason)

    const role = await this.db.role.findUnique({ where: { id: roleId }, select: { id: true, code: true } })
    if (!role) throw roleNotFound()

    // De-duplicate before comparing, so a client that sends the same id twice gets the same result as one that does
    // not — otherwise `changed` would flip on every save.
    const wanted = [...new Set(screenIds)]
    // Compared with the active grants only — the set the matrix showed. Grants on screens that were turned off are not
    // part of what the admin is editing; a save that changes something clears them along with the rest.
    const beforeIds = await this.activeGrantIds(this.db, roleId)
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
        throw new AdminError(
          HttpStatus.BAD_REQUEST,
          'SCREEN_NOT_ASSIGNABLE',
          rejected.length === 1
            ? 'One of these screens can’t be given to a role: it is a Core or Admin screen, turned off, or unknown.'
            : `${rejected.length} of these screens can’t be given to a role: they are Core or Admin screens, turned off, or unknown.`,
          { screen_ids: rejected },
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
   * One audit entry by id, for `GET /admin/audit-log/:id` (the entry page). `AUDIT_ENTRY_NOT_FOUND` (404) when there is
   * no such row.
   *
   * A sensitive entry comes back with its masked `before` / `after` — the copy the writer stored, masked again here with
   * the default sensitive keys in case a row was written without the writer — and opening it is itself recorded as a
   * `view_sensitive` row. That row is written before the data is returned: if it cannot be written, the data is not
   * shown (`AUDIT_WRITE_FAILED`, 503). Opening the same entry again within a minute counts as the same view.
   */
  async getAuditEntry(admin: AdminPrincipal, id: string): Promise<AuditEntryDto> {
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
    if (!row) throw auditEntryNotFound()

    if (row.is_sensitive) {
      const window = Math.floor(Date.now() / SENSITIVE_VIEW_WINDOW_MS)
      try {
        await this.audit.recordSensitiveView(AuditService.staffActor(admin), {
          id: stableAuditId('view_sensitive', admin.id, row.id, String(window)),
          sourceFeature: SOURCE_FEATURE,
          entityType: 'audit_log',
          entityId: row.id,
          summary: `Opened sensitive audit entry #${row.seq.toString()}`,
        })
      } catch {
        throw new AdminError(
          HttpStatus.SERVICE_UNAVAILABLE,
          'AUDIT_WRITE_FAILED',
          'This entry holds sensitive data and opening it could not be recorded, so it is not shown. Try again.',
        )
      }
    }

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
      before: maskValue(row.before, sensitiveKeySet()),
      after: maskValue(row.after, sensitiveKeySet()),
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
      // A plain date is a whole Thailand day: `from` is that day's first instant, `to` runs up to (not including) the
      // next day's. An instant is used exactly as sent.
      const toWholeDay = query.to !== undefined && DATE_ONLY.test(query.to)
      const from = query.from === undefined ? undefined : DATE_ONLY.test(query.from) ? thaiDayStart(query.from) : new Date(query.from)
      const to = query.to === undefined ? undefined : toWholeDay ? thaiDayStart(query.to, 1) : new Date(query.to)
      if (from && to && (toWholeDay ? from >= to : from > to)) {
        throw new AdminError(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', 'The From date is after the To date.', {
          fields: { from: ['from must be on or before to'] },
        })
      }
      where.occurred_at = { ...(from ? { gte: from } : {}), ...(to ? (toWholeDay ? { lt: to } : { lte: to }) : {}) }
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
      // schema.sql: "before/after are masked by the writer; list views hide them". Other rows still pass through the
      // default mask, in case a feature wrote one without the writer.
      before: row.is_sensitive ? null : maskValue(row.before, sensitiveKeySet()),
      after: row.is_sensitive ? null : maskValue(row.after, sensitiveKeySet()),
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
      select: { role_id: true, role: { select: { code: true, name: true, is_admin: true } } },
    })
    if (!staff) return { screen_codes: [], provisioned: false, role: null }
    const screens = await this.screensForRole(staff.role_id, staff.role.is_admin)
    return { screen_codes: screens.map((s) => s.code), provisioned: true, role: { code: staff.role.code, name: staff.role.name } }
  }

  /**
   * `GET /admin/staff/:id/screens`: the menu one staff member gets, by the same policy as `GET /me/screens` — what the
   * Role access "Preview as user" dialog shows. Saved grants only. `active: false` means the account is switched off
   * and cannot sign in at all; `screens` is still what their role would show. `STAFF_NOT_FOUND` (404) for an unknown or
   * removed staff id.
   */
  async screensForStaff(staffId: string): Promise<StaffScreensDto> {
    const staff = await this.db.staff.findFirst({
      where: { id: staffId, deleted_at: null },
      select: {
        id: true,
        role: { select: { id: true, code: true, name: true, is_admin: true } },
        user: { select: { disabled_at: true, deleted_at: true } },
      },
    })
    if (!staff) throw staffNotFound()
    const screens = await this.screensForRole(staff.role.id, staff.role.is_admin)
    return {
      staff_id: staff.id,
      active: !staff.user.disabled_at && !staff.user.deleted_at,
      role: staff.role,
      screens,
    }
  }

  /**
   * The one screen policy: every active `core` screen, every active `admin` screen for an `is_admin` role, and every
   * active `assignable` screen the role holds a `role_screen` grant for. Sorted by feature, then code.
   */
  private async screensForRole(roleId: string, isAdmin: boolean): Promise<ScreenDto[]> {
    const autoKinds: ScreenKind[] = isAdmin ? ['core', 'admin'] : ['core']
    const rows = await this.db.screen.findMany({
      where: {
        is_active: true,
        OR: [{ kind: { in: autoKinds } }, { kind: 'assignable', role_screen: { some: { role_id: roleId } } }],
      },
      orderBy: [{ feature_no: 'asc' }, { code: 'asc' }],
      select: SCREEN_SELECT,
    })
    return rows.map(toScreenDto)
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

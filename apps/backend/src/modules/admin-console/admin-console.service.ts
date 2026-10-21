import { Injectable } from '@nestjs/common'
import type { Prisma } from '@backend/db/generated/prisma/client'
import { DbService } from '@backend/db/db.service'
import type { AuditEntryDto, AuditPage, RoleScreensDto, RoleSummary, ScreenDto, ScreenGroup } from './dto/admin-console.types'
import type { AuditQueryDto } from './dto/audit-query.dto'
import type { RegisterScreenDto } from './dto/register-screen.dto'
import type { SelfRegisterScreen } from './dto/admin-console.types'

const DEFAULT_AUDIT_LIMIT = 50
const MAX_AUDIT_LIMIT = 200

/**
 * All admin-console queries. The PUT that mutates role→screen grants lives in `replace-role-screens.ts` (PR 2) — this
 * file is intentionally read-only so PR 1 stays small and reviewable.
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
  constructor(private readonly db: DbService) {}

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
  /*  Audit log (read) */
  /* ──────────────────────────────────────────────────────────────────────────── */

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

    const items: AuditEntryDto[] = page.map((row) => ({
      seq: row.seq.toString(),
      id: row.id,
      occurred_at: row.occurred_at.toISOString(),
      recorded_at: row.recorded_at.toISOString(),
      actor_type: row.actor_type as AuditEntryDto['actor_type'],
      actor_id: row.actor_id,
      actor_role: row.actor_role,
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
}

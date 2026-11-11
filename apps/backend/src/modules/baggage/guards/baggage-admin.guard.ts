import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import type { Request } from 'express'
import { DbService } from '@backend/db/db.service'
import { AuditService } from '@backend/modules/admin-console/audit/audit.service'
import { AUDIT_SOURCE_FEATURE } from '../common/baggage.constants'
import { baggageAuditActor, type BaggageStaff } from './baggage-staff.guard'

type AdminRequest = Request & { baggageStaff?: BaggageStaff }

/**
 * Feature 10 admin-only routes (spec guard "B (admin)", e.g. baggage settings). Runs AFTER BaggageStaffGuard, which has
 * already resolved an active staff member; this guard then requires that staff member's role to be an admin role
 * (role.is_admin). Baggage desk staff are refused with 403, and the refusal is written to audit_log.
 * Kept inside Feature 10 because the admin console's own guard is not exported for other modules.
 */
@Injectable()
export class BaggageAdminGuard implements CanActivate {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AdminRequest>()
    const staff = req.baggageStaff

    // Misconfiguration (BaggageStaffGuard did not run first): fail closed.
    if (!staff) {
      throw new ForbiddenException('Staff account required')
    }

    const row = await this.db.staff.findFirst({
      where: { id: staff.staffId, deleted_at: null },
      select: { role: { select: { is_admin: true } } },
    })

    if (row?.role.is_admin === true) {
      return true
    }

    const path = (req.originalUrl ?? req.url ?? '').split('?')[0]
    // Never throws; the refusal stands either way.
    await this.audit.recordAccessDenied(baggageAuditActor(staff), {
      sourceFeature: AUDIT_SOURCE_FEATURE,
      entityType: 'screen',
      entityId: 'f10.baggage-settings',
      summary: `Denied access to baggage settings (${req.method} ${path})`,
      reason: `Only admins can view or change baggage settings (role: ${staff.roleCode}).`,
    })
    throw new ForbiddenException('Admin role required')
  }
}

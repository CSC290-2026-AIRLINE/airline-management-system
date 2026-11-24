import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { Request } from 'express'
import { DbService } from '@backend/db/db.service'
import type { AuthenticatedUser } from '@backend/auth/guards/jwt-auth.guard'
import { IS_SUPERVISOR_KEY } from '../decorators/supervisor-only.decorator'

/** The CS staff member the guard found, set on the request. */
export interface StaffPrincipal {
  id: string
  userId: string
  roleCode: string
  isSupervisor: boolean
}

// Feature 12 declares its own `staff` on every express Request; this guard sets ours, so drop theirs from the type.
type StaffRequest = Omit<Request, 'staff'> & { user?: AuthenticatedUser; staff?: StaffPrincipal }

@Injectable()
export class CustomerServiceStaffGuard implements CanActivate {
  constructor(
    private readonly db: DbService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<StaffRequest>()
    const user = req.user
    if (!user) {
      throw new UnauthorizedException()
    }

    const staff = await this.db.staff.findFirst({
      where: {
        user_id: user.id,
        deleted_at: null,
        user: { type: 'staff', disabled_at: null, deleted_at: null },
      },
      include: {
        role: {
          select: {
            code: true,
            is_admin: true,
          },
        },
      },
    })

    if (!staff) {
      throw new ForbiddenException('Staff role required')
    }

    const isSupervisor = staff.role.code === 'cs-supervisor' || staff.role.is_admin === true
    const isAgent = staff.role.code === 'cs-agent'

    if (!isSupervisor && !isAgent) {
      throw new ForbiddenException('Customer service staff role required')
    }

    const requireSupervisor = this.reflector.getAllAndOverride<boolean>(IS_SUPERVISOR_KEY, [context.getHandler(), context.getClass()])

    if (requireSupervisor && !isSupervisor) {
      throw new ForbiddenException('CS supervisor role required')
    }

    req.staff = {
      id: staff.id,
      userId: user.id,
      roleCode: staff.role.code,
      isSupervisor,
    }

    return true
  }
}

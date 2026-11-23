import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import type { AdminPrincipal } from '../guards/admin-console.guard'

/**
 * Reads the admin principal the `AdminConsoleGuard` stashed on the request. Use only on routes protected by that guard.
 */
export const Admin = createParamDecorator((_: unknown, ctx: ExecutionContext): AdminPrincipal => {
  return ctx.switchToHttp().getRequest<{ admin: AdminPrincipal }>().admin
})

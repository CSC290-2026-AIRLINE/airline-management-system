import { Body, Controller, Delete, Get, HttpCode, Post, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common'
import { CurrentUser } from '@backend/auth/decorators/current-user.decorator'
import type { AuthenticatedUser } from '@backend/auth/guards/jwt-auth.guard'
import { DevPaymentsService, type DevPaymentDto } from './dev-payments.service'
import { DevToolsGuard } from './dev-tools.guard'
import { CreateDevPaymentDto } from './dto/create-dev-payment.dto'

/**
 * TODO(F5-dev): delete with the rest of `payments-dev-tools` before the PR merges.
 *
 * The payment sandbox: a customer starts a test payment here, pays it through the real `POST /api/payments/:id/checkout`,
 * and watches it on the real result page. 404 unless `PAYMENT_DEV_TOOLS` is on.
 */
@Controller('dev/payments')
@UseGuards(DevToolsGuard)
// There is no global validation pipe in this app: every controller sets its own.
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class DevPaymentsController {
  constructor(private readonly payments: DevPaymentsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser): Promise<DevPaymentDto[]> {
    return this.payments.list(user.id)
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateDevPaymentDto): Promise<DevPaymentDto> {
    return this.payments.create(user.id, dto)
  }

  @Delete()
  @HttpCode(200)
  removeAll(@CurrentUser() user: AuthenticatedUser): Promise<{ removed: number }> {
    return this.payments.removeAll(user.id)
  }
}

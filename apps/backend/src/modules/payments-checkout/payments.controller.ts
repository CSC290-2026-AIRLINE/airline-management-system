import { Controller, Get, Param } from '@nestjs/common'
import { CurrentUser } from '@backend/auth/decorators/current-user.decorator'
import type { AuthenticatedUser } from '@backend/auth/guards/jwt-auth.guard'
import { PaymentsCheckoutService } from './payments-checkout.service'
import type { PaymentStatusDto } from './dto/payments-checkout.types'

/**
 * `/api/payments/:id` — the status a selling feature's confirmation page polls.
 *
 * The frames say this page belongs to Feature 3, 6, 12 or 17, not to Feature 5: "In the product this is the selling
 * feature's own confirmation page, which polls the payment and shows these states." So Feature 5 exposes the status
 * and lets those features render it.
 *
 * The status the frames show is one step further on than the stored status: `state` is the screen state ("authorised",
 * "captured", "confirming", "failed", "expired", "refunded"), and it is mapped in one place, `payment-status.ts`.
 */
@Controller('payments')
export class PaymentsController {
  constructor(private readonly svc: PaymentsCheckoutService) {}

  /** The payment's status, its screen state and whether a receipt exists yet. */
  @Get(':id')
  getPaymentStatus(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<PaymentStatusDto> {
    return this.svc.getPaymentStatus(user.id, id)
  }
}

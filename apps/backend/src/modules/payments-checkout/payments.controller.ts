import { Controller, Get, HttpCode, Param, Post, UseFilters } from '@nestjs/common'
import { PaymentsErrorFilter } from '@backend/modules/payments-checkout/payments-error.filter'
import { APP_ORIGINS } from '@backend/auth/auth.constants'
import { CurrentUser } from '@backend/auth/decorators/current-user.decorator'
import type { AuthenticatedUser } from '@backend/auth/guards/jwt-auth.guard'
import { PaymentsCheckoutService } from './payments-checkout.service'
import type { CheckoutStartedDto, PaymentStatusDto, ReceiptDetailDto } from './dto/payments-checkout.types'

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
@UseFilters(PaymentsErrorFilter)
export class PaymentsController {
  constructor(private readonly svc: PaymentsCheckoutService) {}

  /** The payment's status, its screen state and whether a receipt exists yet. */
  @Get(':id')
  getPaymentStatus(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<PaymentStatusDto> {
    return this.svc.getPaymentStatus(user.id, id)
  }

  /**
   * Starts the card payment on the provider's own page; the response says where to send the customer. The page sends them
   * back to the customer app's result screen, which polls `GET /payments/:id` for the outcome.
   */
  @Post(':id/checkout')
  @HttpCode(200)
  startCheckout(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<CheckoutStartedDto> {
    const origin = Object.entries(APP_ORIGINS).find(([, config]) => config.userType === 'customer')?.[0] ?? ''
    const result = `${origin}/payments/result?payment=${encodeURIComponent(id)}`
    return this.svc.startCheckout(user.id, id, { success_url: `${result}&outcome=paid`, cancel_url: `${result}&outcome=cancelled` })
  }

  /** `POST /payments/:id/attempts` — a new session after the old one ended, while the hold lasts (the spec's name for the route above). */
  @Post(':id/attempts')
  @HttpCode(200)
  newAttempt(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<CheckoutStartedDto> {
    return this.startCheckout(user, id)
  }

  /** `GET /payments/:id/receipt` — the receipt or invoice of a payment, with its lines and credit notes. */
  @Get(':id/receipt')
  receipt(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<ReceiptDetailDto> {
    return this.svc.getCustomerReceiptForPayment(user.id, id)
  }
}

/** `/api/customers/me/payments` — the signed-in customer's payments, newest first. */
@Controller('customers/me')
@UseFilters(PaymentsErrorFilter)
export class CustomerPaymentsController {
  constructor(private readonly svc: PaymentsCheckoutService) {}

  @Get('payments')
  payments(@CurrentUser() user: AuthenticatedUser): Promise<PaymentStatusDto[]> {
    return this.svc.listCustomerPayments(user.id)
  }
}

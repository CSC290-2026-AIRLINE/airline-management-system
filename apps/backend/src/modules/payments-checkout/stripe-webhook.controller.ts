import { Controller, Headers, HttpCode, Post, Req, type RawBodyRequest, UseFilters } from '@nestjs/common'
import { PaymentsErrorFilter } from '@backend/modules/payments-checkout/payments-error.filter'
import type { Request } from 'express'
import { Public } from '@backend/auth/decorators/public.decorator'
import { PaymentsCheckoutService } from './payments-checkout.service'

/**
 * `POST /api/webhooks/stripe` — where Stripe reports that a card was authorised, refused or never paid.
 *
 * It is public because Stripe has no token: the request is trusted only if its signature matches the raw bytes
 * (`main.ts` keeps them on `req.rawBody`). A bad signature is a 400 and nothing is read from the body.
 */
@Controller('webhooks')
@UseFilters(PaymentsErrorFilter)
export class PaymentWebhookController {
  constructor(private readonly svc: PaymentsCheckoutService) {}

  @Public()
  @Post('stripe')
  @HttpCode(200)
  receive(@Req() req: RawBodyRequest<Request>, @Headers('stripe-signature') signature?: string): Promise<{ received: true }> {
    return this.svc.handleProviderWebhook(req.rawBody, signature)
  }
}

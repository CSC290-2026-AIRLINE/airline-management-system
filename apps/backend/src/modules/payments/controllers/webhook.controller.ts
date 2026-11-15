import { BadRequestException, Body, Controller, Get, HttpCode, Inject, NotFoundException, Param, Post, Req, UsePipes } from '@nestjs/common'
import type { RawBodyRequest } from '@nestjs/common'
import type { Request } from 'express'
import { Public } from '@backend/auth/decorators/public.decorator'
import { FakeCompleteDto } from '../dto/payments.dto'
import { PaymentErrorCode, paymentError } from '../payments.errors'
import { paymentsValidationPipe } from '../payments.pipes'
import { FakePaymentProvider } from '../providers/fake.provider'
import { PAYMENT_PROVIDER, type PaymentProvider } from '../providers/payment-provider'
import { StripePaymentProvider } from '../providers/stripe.provider'
import { WebhookService } from '../services/webhook.service'

/**
 * POST /webhooks/stripe is the one public route: its guard is the signature check over the raw body (the app is
 * created with rawBody: true). The answer is 200 only after the event was stored and applied.
 */
@Controller('webhooks')
export class WebhookController {
  constructor(
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly webhooks: WebhookService,
  ) {}

  @Public()
  @Post('stripe')
  @HttpCode(200)
  async stripe(@Req() req: RawBodyRequest<Request>) {
    if (!(this.provider instanceof StripePaymentProvider)) throw new NotFoundException()
    const raw = req.rawBody
    const signature = req.headers['stripe-signature']
    if (!raw || !this.provider.verifyWebhook(raw, Array.isArray(signature) ? signature[0] : signature)) {
      throw new BadRequestException(paymentError(PaymentErrorCode.WEBHOOK_SIGNATURE_INVALID, 'Invalid Stripe signature'))
    }
    const event = await this.provider.normalise(JSON.parse(raw.toString('utf8')) as Record<string, unknown>)
    return { received: true, result: await this.webhooks.ingest(event) }
  }
}

/**
 * The fake provider's hosted page (customer-web /pay/fake) reads and completes its session here. Exists only while
 * PAYMENT_PROVIDER=fake; with Stripe these routes answer 404.
 */
@Controller('payments/fake-provider')
@UsePipes(paymentsValidationPipe)
export class FakeProviderController {
  constructor(@Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider) {}

  @Get('sessions/:sessionId')
  session(@Param('sessionId') sessionId: string) {
    const session = this.fake().describe(sessionId)
    if (!session) throw new NotFoundException(paymentError(PaymentErrorCode.PAYMENT_NOT_FOUND, 'Unknown or expired session'))
    return session
  }

  @Post('sessions/:sessionId/complete')
  @HttpCode(200)
  async complete(@Param('sessionId') sessionId: string, @Body() dto: FakeCompleteDto) {
    const result = await this.fake().complete(sessionId, dto.outcome)
    if (!result) throw new NotFoundException(paymentError(PaymentErrorCode.PAYMENT_NOT_PAYABLE, 'This session is no longer open'))
    return result
  }

  private fake(): FakePaymentProvider {
    if (!(this.provider instanceof FakePaymentProvider)) throw new NotFoundException()
    return this.provider
  }
}

import { Controller, Get, Param, Query, UsePipes, ValidationPipe } from '@nestjs/common'
import { CurrentUser } from '@backend/auth/decorators/current-user.decorator'
import type { AuthenticatedUser } from '@backend/auth/guards/jwt-auth.guard'
import { PaymentsCheckoutService } from './payments-checkout.service'
import { ReceiptQueryDto } from './dto/receipt-query.dto'
import type { ReceiptDetailDto, ReceiptListDto } from './dto/payments-checkout.types'

/**
 * `/api/receipts` — the signed-in customer's own receipts.
 *
 * The global `JwtAuthGuard` already requires a bearer token, so there is no auth decorator on the class. The receipts
 * are filtered by the token's user id in the service, so one customer can never read another's receipt.
 *
 * The ids are opaque strings in the mock (`rc_…`). The real repository's receipt ids are UUIDs, and `ParseUUIDPipe`
 * comes back with it.
 */
@Controller('receipts')
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class ReceiptsController {
  constructor(private readonly svc: PaymentsCheckoutService) {}

  /** The customer's receipts, newest first, with the counts the frames show on the filter chips. */
  @Get()
  listReceipts(@CurrentUser() user: AuthenticatedUser, @Query() query: ReceiptQueryDto): Promise<ReceiptListDto> {
    return this.svc.listCustomerReceipts(user.id, query)
  }

  /** One receipt, with its lines and any credit note attached to it. 404 when it is not the customer's. */
  @Get(':id')
  getReceipt(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<ReceiptDetailDto> {
    return this.svc.getCustomerReceipt(user.id, id)
  }
}

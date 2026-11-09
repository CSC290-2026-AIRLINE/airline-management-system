import { Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common'
import { CurrentUser } from '@backend/auth/decorators/current-user.decorator'
import type { AuthenticatedUser } from '@backend/auth/guards/jwt-auth.guard'
import { CancelService } from './cancel.service'
import type { CancelBookingResult, CancellationPreview } from './cancel.types'

/** B6: customer cancellation preview and cancel. A customer asking for another customer's booking gets 404. */
@Controller('bookings')
export class CancelController {
  constructor(private readonly cancel: CancelService) {}

  @Get(':ref/cancellation-preview')
  getCancellationPreview(@CurrentUser() user: AuthenticatedUser, @Param('ref') ref: string): Promise<CancellationPreview> {
    return this.cancel.getPreview(ref, user.id)
  }

  @Post(':ref/cancel')
  @HttpCode(HttpStatus.OK)
  cancelBooking(@CurrentUser() user: AuthenticatedUser, @Param('ref') ref: string): Promise<CancelBookingResult> {
    return this.cancel.cancelBooking(ref, user.id)
  }
}

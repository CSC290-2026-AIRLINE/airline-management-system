import { BadRequestException, Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UsePipes, ValidationPipe } from '@nestjs/common'
import type { ValidationError } from '@nestjs/common'
import { CurrentUser } from '@backend/auth/decorators/current-user.decorator'
import type { AuthenticatedUser } from '@backend/auth/guards/jwt-auth.guard'
import { CancelService } from './cancel.service'
import { StaffCancelBookingDto } from './dto/staff-cancel-booking.dto'
import type { CancelBookingResult, CancellationPreview, StaffCancelBookingResult, StaffCancellationPreview } from './cancel.types'

/**
 * Turns class-validator failures into the `{ error: { code, message, details? } }` shape the staff dialog reads. A
 * missing reason is reported as `REASON_REQUIRED`, so the dialog can show it under the Reason field.
 */
function toStaffValidationError(errors: ValidationError[]): BadRequestException {
  if (errors.some((error) => error.property === 'reason')) {
    return new BadRequestException({
      error: { code: 'REASON_REQUIRED', message: 'A reason is required.' },
    })
  }
  const fields = Object.fromEntries(errors.map((error) => [error.property, Object.values(error.constraints ?? {})]))
  return new BadRequestException({
    error: { code: 'VALIDATION_FAILED', message: 'Some fields are missing or invalid.', details: { fields } },
  })
}

/**
 * B6: the customer cancellation preview and cancel. A customer asking for another customer's booking gets 404.
 * B7: the staff cancel routes, which share B6's cancellation and write the Feature 15 entry.
 *
 * The class has no path of its own, so every route spells its full path: the work split keeps the staff-cancel route
 * in `cancel/` with B6 and does not want a second controller in this folder.
 */
@Controller()
export class CancelController {
  constructor(private readonly cancel: CancelService) {}

  @Get('bookings/:ref/cancellation-preview')
  getCancellationPreview(@CurrentUser() user: AuthenticatedUser, @Param('ref') ref: string): Promise<CancellationPreview> {
    return this.cancel.getPreview(ref, user.id)
  }

  @Post('bookings/:ref/cancel')
  @HttpCode(HttpStatus.OK)
  cancelBooking(@CurrentUser() user: AuthenticatedUser, @Param('ref') ref: string): Promise<CancelBookingResult> {
    return this.cancel.cancelBooking(ref, user.id)
  }

  /** B7: the staff dialog's preview: the fee, the refund and the amounts when the agent waives the fee (D8). */
  @Get('staff/bookings/:ref/cancellation-preview')
  getStaffCancellationPreview(@CurrentUser() user: AuthenticatedUser, @Param('ref') ref: string): Promise<StaffCancellationPreview> {
    return this.cancel.getStaffPreview(ref, user.id)
  }

  /** B7: a staff cancellation, with a required reason and an optional fee waiver. */
  @Post('staff/bookings/:ref/cancel')
  @HttpCode(HttpStatus.OK)
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: toStaffValidationError,
    }),
  )
  staffCancelBooking(
    @CurrentUser() user: AuthenticatedUser,
    @Param('ref') ref: string,
    @Body() dto: StaffCancelBookingDto,
  ): Promise<StaffCancelBookingResult> {
    return this.cancel.staffCancelBooking(ref, user.id, { reason: dto.reason, waiveFee: dto.waiveFee ?? false })
  }
}

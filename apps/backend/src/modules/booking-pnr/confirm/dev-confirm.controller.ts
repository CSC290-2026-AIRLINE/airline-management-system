import { Controller, NotFoundException, Param, Post } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { EnvConfig } from '@backend/config/env.validation'
import type { ConfirmBookingResult } from '../contracts'
import { ConfirmService } from './confirm.service'

/** Dev-only stand-in for Feature 5a's checkout: the Review & Pay "Confirm" button calls it. Gone in production. */
@Controller('dev/bookings')
export class DevConfirmController {
  constructor(
    private readonly confirm: ConfirmService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  @Post(':ref/confirm')
  confirmBooking(@Param('ref') ref: string): Promise<ConfirmBookingResult> {
    if (this.config.get('NODE_ENV', { infer: true }) === 'production') {
      throw new NotFoundException()
    }
    return this.confirm.confirmBooking(ref)
  }
}

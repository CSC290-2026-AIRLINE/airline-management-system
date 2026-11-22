import { Body, Controller, NotFoundException, Param, Post } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { EnvConfig } from '@backend/config/env.validation'
import type { ConfirmBookingResult, InsurancePolicySummary } from '../contracts'
import { BookingInsuranceService } from '../insurance/insurance.service'
import { ConfirmService } from './confirm.service'

/** Dev-only stand-in for Feature 5a's checkout: the Review & Pay "Confirm" button calls it. Gone in production. */
@Controller('dev/bookings')
export class DevConfirmController {
  constructor(
    private readonly confirm: ConfirmService,
    private readonly insurance: BookingInsuranceService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  @Post(':ref/confirm')
  async confirmBooking(
    @Param('ref') ref: string,
    @Body() body: { addInsurance?: unknown } | undefined,
  ): Promise<ConfirmBookingResult & { insurancePolicy: InsurancePolicySummary | null }> {
    if (this.config.get('NODE_ENV', { infer: true }) === 'production') {
      throw new NotFoundException()
    }
    const addInsurance = body?.addInsurance === true
    if (addInsurance) await this.insurance.assertAddable(ref)
    const result = await this.confirm.confirmBooking(ref)
    // The add-on the customer ticked on Review & Pay, charged here in place of feature 5a.
    const insurancePolicy = await this.insurance.settleAfterConfirm(result.bookingId, addInsurance)
    return { ...result, insurancePolicy }
  }
}

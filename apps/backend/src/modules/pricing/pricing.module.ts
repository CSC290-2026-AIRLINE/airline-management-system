import { Module } from '@nestjs/common'
import { FareClassController } from './fare-class/fare-class.controller'
import { FareClassService } from './fare-class/fare-class.service'
import { PublicSeatFeeController, SeatFeeController } from './seat-fee/seat-fee.controller'
import { SeatFeeService } from './seat-fee/seat-fee.service'
import { TaxFeeController } from './tax-fee/tax-fee.controller'
import { TaxFeeService } from './tax-fee/tax-fee.service'

@Module({
  controllers: [FareClassController, SeatFeeController, PublicSeatFeeController, TaxFeeController],
  providers: [FareClassService, SeatFeeService, TaxFeeService],
  exports: [FareClassService, SeatFeeService, TaxFeeService],
})
export class PricingModule {}

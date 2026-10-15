import { Module } from '@nestjs/common'
import { FareClassController } from './fare-class/fare-class.controller'
import { FareClassService } from './fare-class/fare-class.service'

@Module({
  controllers: [FareClassController],
  providers: [FareClassService],
  exports: [FareClassService],
})
export class PricingModule {}

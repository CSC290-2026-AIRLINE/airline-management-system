import { PartialType } from '@nestjs/mapped-types'
import { CreateBaggageRateDto } from './create-baggage-rate.dto'

export class UpdateBaggageRateDto extends PartialType(CreateBaggageRateDto) {}

import { PartialType } from '@nestjs/mapped-types'
import { CreateSeatFeeDto } from './create-seat-fee.dto'

export class UpdateSeatFeeDto extends PartialType(CreateSeatFeeDto) {}

import { PartialType } from '@nestjs/mapped-types'
import { CreateTaxFeeDto } from './create-tax-fee.dto'

export class UpdateTaxFeeDto extends PartialType(CreateTaxFeeDto) {}

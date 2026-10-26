import { PartialType, PickType } from '@nestjs/mapped-types'
import { FARE_RULE_FIELDS } from '../../pricing.constants'
import { CreateFareClassDto } from './create-fare-class.dto'

// Only the restriction columns; same validation as the fare class DTO.
export class UpdateFareRuleDto extends PartialType(PickType(CreateFareClassDto, FARE_RULE_FIELDS)) {}

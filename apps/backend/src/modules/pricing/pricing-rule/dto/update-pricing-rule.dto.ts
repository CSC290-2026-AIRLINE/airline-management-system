import { OmitType, PartialType } from '@nestjs/mapped-types'
import { CreatePricingRuleDto } from './create-pricing-rule.dto'

// The group cannot change: its condition columns would no longer fit. Delete the rule and create one in the other group.
// Send null to clear a condition column or fare_class_id.
export class UpdatePricingRuleDto extends PartialType(OmitType(CreatePricingRuleDto, ['rule_group'] as const)) {}

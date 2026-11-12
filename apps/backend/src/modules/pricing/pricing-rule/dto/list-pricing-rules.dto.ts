import { IsBooleanString, IsIn, IsOptional } from 'class-validator'
import { RULE_GROUPS, type RuleGroup } from '../../pricing.constants'

export class ListPricingRulesDto {
  @IsOptional()
  @IsIn(RULE_GROUPS)
  rule_group?: RuleGroup

  // Inactive rules are listed too unless active_only=true, so staff can switch them back on.
  @IsOptional()
  @IsBooleanString()
  active_only?: string
}

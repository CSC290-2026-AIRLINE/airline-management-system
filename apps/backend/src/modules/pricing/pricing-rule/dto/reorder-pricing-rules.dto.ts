import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsIn, IsUUID } from 'class-validator'
import { RULE_GROUPS, type RuleGroup } from '../../pricing.constants'

// ids = every live rule of the group, in the new order (first = priority 1).
export class ReorderPricingRulesDto {
  @IsIn(RULE_GROUPS)
  rule_group!: RuleGroup

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000) // the reorder shifts priorities by 1000 first, so at most 1000 rules per group
  @ArrayUnique()
  @IsUUID('all', { each: true })
  ids!: string[]
}

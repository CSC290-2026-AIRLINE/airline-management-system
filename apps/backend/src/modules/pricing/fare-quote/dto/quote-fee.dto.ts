import { IsIn } from 'class-validator'

export const QUOTE_FEE_TYPES = ['cancel', 'change'] as const
export type QuoteFeeType = (typeof QUOTE_FEE_TYPES)[number]

export class QuoteFeeDto {
  @IsIn(QUOTE_FEE_TYPES)
  type!: QuoteFeeType
}

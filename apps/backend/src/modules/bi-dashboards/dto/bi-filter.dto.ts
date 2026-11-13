import { IsDateString, IsIn, IsOptional, IsUUID, Matches, Validate, ValidatorConstraint } from 'class-validator'
import type { ValidationArguments, ValidatorConstraintInterface } from 'class-validator'
import { CABIN_KEYS, DELAY_CAUSES, PERIOD_GROUPS, REVENUE_MODES } from './bi-options'
import type { CabinKey, DelayCause, PeriodGroup, RevenueMode } from './bi-options'

@ValidatorConstraint({ name: 'biDateRange', async: false })
class BiDateRange implements ValidatorConstraintInterface {
  validate(to: unknown, args: ValidationArguments): boolean {
    const { from } = args.object as BiFilterDto
    return !from || typeof to !== 'string' || from <= to
  }

  defaultMessage(): string {
    return 'to must be on or after from'
  }
}

/** Filters shared by the BI read endpoints. Dates are the flight's local service date. */
export class BiFilterDto {
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^(?!0000)\d{4}-\d{2}-\d{2}$/)
  from?: string

  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^(?!0000)\d{4}-\d{2}-\d{2}$/)
  @Validate(BiDateRange)
  to?: string

  @IsOptional()
  @IsUUID()
  route_id?: string

  @IsOptional()
  @IsIn(PERIOD_GROUPS)
  group?: PeriodGroup

  @IsOptional()
  @IsIn(REVENUE_MODES)
  revenue_mode?: RevenueMode

  @IsOptional()
  @IsIn(CABIN_KEYS)
  cabin?: CabinKey

  @IsOptional()
  @IsIn(DELAY_CAUSES)
  cause?: DelayCause

  /** `true` (the default) counts departed flights only, as the on-time and load-factor figures do. */
  @IsOptional()
  @IsIn(['true', 'false'])
  departed_only?: 'true' | 'false'
}

/** `YYYY-MM` for the finance month selector. */
export class BiFinanceQueryDto {
  @IsOptional()
  @Matches(/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/)
  month?: string
}

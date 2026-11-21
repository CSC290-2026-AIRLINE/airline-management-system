import { IsArray, ArrayNotEmpty, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, Min } from 'class-validator'
import type {
  CountryLanguageInput,
  CountryLimitInput,
  DefaultLimitsRow,
} from '@backend/modules/crew-rostering/setup-rule/setup-rule.service'
import { LowerEach, ToNumber, Trim } from '@backend/modules/crew-rostering/dto/validation'

/** A finite, non-negative number, sent as a number or a numeric string. */
const Limit = (): PropertyDecorator => (target, key) => {
  ToNumber()(target, key)
  IsNumber({ allowNaN: false, allowInfinity: false }, { message: ({ property }) => `${property} must be a number` })(target, key)
  Min(0, { message: ({ property }) => `${property} cannot be negative` })(target, key)
}

/** `PUT defaults`: the company-wide legality limits. */
export class DefaultLimitsDto implements DefaultLimitsRow {
  @Limit() minRestHours!: number
  @Limit() maxDutyHours!: number
  @Limit() maxFlightsPerDuty!: number
  @Limit() maxPairingDays!: number
  @Limit() hoursCap28d!: number
  @Limit() minLocalCrew!: number
  @Limit() minPolice!: number
}

/** A destination country's stricter rest and duty limits. */
export class CountryLimitDto implements CountryLimitInput {
  @Trim()
  @IsString({ message: 'country is required' })
  @IsNotEmpty({ message: 'country is required' })
  country!: string

  @Limit() minRestHours!: number
  @Limit() maxDutyHours!: number
}

/** The languages local crew must speak for one country. `country_language.language_code` is 2-letter ISO 639-1, lower case. */
export class CountryLanguageDto implements CountryLanguageInput {
  @IsOptional()
  @Trim()
  @IsString()
  country?: string

  @LowerEach()
  @IsArray({ message: 'languages must list at least one code' })
  @ArrayNotEmpty({ message: 'languages must list at least one code' })
  @Matches(/^[a-z]{2}$/, { each: true, message: 'languages must be 2-letter language codes' })
  languages!: string[]
}

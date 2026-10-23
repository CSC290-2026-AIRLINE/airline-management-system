import { Transform } from 'class-transformer'
import {
  IsISO31661Alpha2,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  IsInt,
  Min,
  Max,
  MaxLength,
  Matches,
  Validate,
  ValidateIf,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator'
import { Type } from 'class-transformer'
import { normalizePassportName, normalizePassportNumber } from '../identity-normalization'
import { isValidBirthDate } from '../birth-date'

export const GENDERS = ['M', 'F', 'X'] as const
export const RELATIONSHIPS = ['spouse', 'parent', 'child', 'sibling', 'guardian', 'companion', 'other'] as const
const defined = (_object: unknown, value: unknown) => value !== undefined
const nullableTrim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() || null : value)
const country = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value)
const passport = ({ value }: { value: unknown }) => normalizePassportNumber(value)
const latinName = ({ value }: { value: unknown }) => normalizePassportName(value)
const passportName = /^[A-Za-z][A-Za-z .'-]*$/

@ValidatorConstraint({ name: 'birthDate', async: false })
export class BirthDateValidator implements ValidatorConstraintInterface {
  validate(value: unknown) {
    // Use real time until the shared clock is available; replace only this source when it lands.
    return isValidBirthDate(value, new Date())
  }
  defaultMessage() {
    return 'dateOfBirth must be a real date in YYYY-MM-DD format between 1900-01-01 and today'
  }
}

export class CreateSavedPassengerDto {
  @Transform(latinName)
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  @Matches(passportName)
  firstName!: string
  @Transform(latinName)
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  @Matches(passportName)
  lastName!: string
  @Transform(nullableTrim)
  @IsOptional()
  @IsString()
  @MaxLength(80)
  localFirstName?: string | null
  @Transform(nullableTrim)
  @IsOptional()
  @IsString()
  @MaxLength(80)
  localLastName?: string | null
  @IsOptional()
  @IsIn(RELATIONSHIPS, {
    message: 'relationship must be spouse, parent, child, sibling, guardian, companion or other; use /me for yourself',
  })
  relationship?: string | null
  @Validate(BirthDateValidator)
  dateOfBirth!: string
  @IsIn(GENDERS)
  gender!: string
  @Transform(country)
  @IsString()
  @IsISO31661Alpha2()
  nationality!: string
  @Transform(passport)
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z0-9]{3,30}$/)
  passportNumber?: string | null
}

export class UpdateSavedPassengerDto {
  @Transform(latinName)
  @ValidateIf(defined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  @Matches(passportName)
  firstName?: string
  @Transform(latinName)
  @ValidateIf(defined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  @Matches(passportName)
  lastName?: string
  @Transform(nullableTrim)
  @IsOptional()
  @IsString()
  @MaxLength(80)
  localFirstName?: string | null
  @Transform(nullableTrim)
  @IsOptional()
  @IsString()
  @MaxLength(80)
  localLastName?: string | null
  @IsOptional()
  @IsIn(RELATIONSHIPS)
  relationship?: string | null
  @Transform(passport)
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z0-9]{3,30}$/)
  passportNumber?: string | null
}

export class ProfileUpdateDto {
  @Transform(latinName)
  @ValidateIf(defined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  @Matches(passportName)
  firstName?: string
  @Transform(latinName)
  @ValidateIf(defined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  @Matches(passportName)
  lastName?: string
  @Transform(nullableTrim)
  @IsOptional()
  @IsString()
  @MaxLength(80)
  localFirstName?: string | null
  @Transform(nullableTrim)
  @IsOptional()
  @IsString()
  @MaxLength(80)
  localLastName?: string | null
  @Transform(passport)
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z0-9]{3,30}$/)
  passportNumber?: string | null
  @Transform(nullableTrim)
  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9 ()-]{7,30}$/)
  phone?: string | null
  @ValidateIf(defined)
  @Validate(BirthDateValidator)
  dateOfBirth?: string
  @ValidateIf(defined)
  @IsIn(GENDERS)
  gender?: string
  @Transform(country)
  @ValidateIf(defined)
  @IsString()
  @IsISO31661Alpha2()
  nationality?: string
  @Transform(nullableTrim)
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @IsUrl({ protocols: ['https'], require_protocol: true })
  profilePhotoUrl?: string | null
}

export class SavedPassengerQueryDto {
  @IsOptional()
  @IsUUID()
  cursor?: string
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 50
}

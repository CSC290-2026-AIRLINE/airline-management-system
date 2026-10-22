import { Transform, type TransformFnParams } from 'class-transformer'
import { IsDateString, IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, ValidateIf } from 'class-validator'
import { WATCHLIST_COUNTRY_CODES, WATCHLIST_TYPES } from '../watchlist.constants'

const trim = ({ value }: TransformFnParams): unknown => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value)
const upper = (params: TransformFnParams): unknown => {
  const value = trim(params)
  return typeof value === 'string' ? value.toUpperCase() : value
}
const optionalText = (params: TransformFnParams): unknown => {
  const value = trim(params)
  return value === '' ? null : value
}
const nationality = (params: TransformFnParams): unknown => {
  const value = optionalText(params)
  return typeof value === 'string' ? value.toLowerCase() : value
}
const passport = ({ value }: TransformFnParams): unknown =>
  typeof value === 'string' ? value.replace(/[\s-]/g, '').toUpperCase() || null : value

class WatchlistOptionalFieldsDto {
  @Transform(optionalText)
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dateOfBirth must use YYYY-MM-DD' })
  @IsDateString({ strict: true })
  dateOfBirth?: string | null

  @Transform(nationality)
  @IsOptional()
  @IsIn(WATCHLIST_COUNTRY_CODES, { message: 'nationality must be a supported alpha-2 country code' })
  nationality?: string | null

  @Transform(passport)
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z0-9]+$/, { message: 'passportNumber must contain only letters and numbers' })
  @MaxLength(20)
  passportNumber?: string | null

  @Transform(optionalText)
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string | null
}

export class CreateWatchlistEntryDto extends WatchlistOptionalFieldsDto {
  @Transform(upper)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Matches(/^[A-Z][A-Z .'-]*$/, { message: 'firstName must use the Latin spelling on the passport' })
  firstName!: string

  @Transform(upper)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Matches(/^[A-Z][A-Z .'-]*$/, { message: 'lastName must use the Latin spelling on the passport' })
  lastName!: string

  @IsIn(WATCHLIST_TYPES)
  listType!: (typeof WATCHLIST_TYPES)[number]

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  issuingAuthority!: string
}

export class UpdateWatchlistEntryDto extends WatchlistOptionalFieldsDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(WATCHLIST_TYPES)
  listType?: (typeof WATCHLIST_TYPES)[number]

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(upper)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Matches(/^[A-Z][A-Z .'-]*$/, { message: 'firstName must use the Latin spelling on the passport' })
  firstName?: string

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(upper)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Matches(/^[A-Z][A-Z .'-]*$/, { message: 'lastName must use the Latin spelling on the passport' })
  lastName?: string

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  issuingAuthority?: string
}

export class ClearWatchlistEntryDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  reason!: string
}

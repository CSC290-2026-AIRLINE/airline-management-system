import { BadRequestException } from '@nestjs/common'
import { Transform, type TransformFnParams } from 'class-transformer'
import { IsDate, IsIn, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator'
import { birthDateError } from '../birth-date'
import { GENDERS } from '../identity-constants'
export { GENDERS } from '../identity-constants'

/**
 * The identity columns shared by `POST /api/staff/passengers` and
 * `PUT /api/staff/passengers/:id/identity`.
 *
 * `passenger.gender` is `CHECK (gender IN ('M', 'F', 'X'))` — see `src/db/schema.sql`.
 */
/** Exported so `CorrectIdentityDto` validates gender against the same list, not a second copy. */

export type Gender = (typeof GENDERS)[number]

/** A short country code in lower case (`th`, `hk`, `jp`, `mm`), per `src/db/schema.sql`. */
const NATIONALITY_PATTERN = /^[a-z]{2}$/

/** Passport is "uppercase letters and digits only" once normalised. */
const PASSPORT_PATTERN = /^[A-Z0-9]+$/

/**
 * The identity columns are written by more than one route, and the database constrains
 * several of them with a `CHECK`. They live on one base class for the same reason the
 * readers used to be shared: a value accepted here is also accepted by the column, instead
 * of two copies of the rules drifting apart.
 *
 * `class-validator` checks a value but never rewrites it, so normalisation is the
 * `@Transform` layer's job and validation runs on what came out of it. A DTO that only
 * validated would let `gender: 'f'` through to a column that accepts `F`.
 */

/** Anything that is not a string is passed through untouched, so a validator names the field. */
function trimmed(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value
}

/** An absent, empty or whitespace-only value is `null`; that is what "not recorded" means on these columns. */
export function readOptional({ value }: TransformFnParams): unknown {
  const text = trimmed(value)
  return typeof text === 'string' && text === '' ? null : text
}

/** Required text trims to `''` when absent, so `@IsNotEmpty()` reports it as missing rather than as a type error. */
export function readRequired({ value }: TransformFnParams): unknown {
  const text = trimmed(value)
  return text === undefined || text === null ? '' : text
}

export function readGender({ value }: TransformFnParams): unknown {
  const trimmed = readOptional({ value } as TransformFnParams)
  return typeof trimmed === 'string' ? trimmed.toUpperCase() : trimmed
}

export function readNationality({ value }: TransformFnParams): unknown {
  const trimmed = readOptional({ value } as TransformFnParams)
  // Membership in the team's code list is not checked here: no such list ships in
  // this repository, and rejecting a valid code would be worse than accepting an
  // unknown one. See the module README.
  return typeof trimmed === 'string' ? trimmed.toLowerCase() : trimmed
}

/** Stored normalised: upper case, no spaces or dashes. */
export function readPassport({ value }: TransformFnParams): unknown {
  const trimmed = readOptional({ value } as TransformFnParams)
  return typeof trimmed === 'string' ? trimmed.replace(/[\s-]/g, '').toUpperCase() : trimmed
}

/** The column is `@db.Date`, so a date of birth is midnight UTC and serializes as `1995-04-14T00:00:00.000Z`. */
export function readDateOfBirth({ value }: TransformFnParams): unknown {
  const trimmed = readOptional({ value } as TransformFnParams)
  if (typeof trimmed !== 'string') {
    return trimmed
  }
  // Keep the staff error messages while sharing the same calendar rule as customer forms.
  const error = birthDateError(trimmed, new Date())
  if (error === 'format') throw new BadRequestException('dateOfBirth must be an ISO date (YYYY-MM-DD)')
  if (error === 'invalid') throw new BadRequestException('dateOfBirth is not a real date')
  if (error === 'too_early') throw new BadRequestException('dateOfBirth must not be before 1900')
  if (error === 'future') throw new BadRequestException('dateOfBirth must not be in the future')
  const date = new Date(trimmed + 'T00:00:00.000Z')
  return date
}

/**
 * The passport rule the Artifact states as "uppercase letters and digits only".
 * Enforced by {@link PASSPORT_PATTERN} on the DTO, after {@link readPassport} has
 * normalised away spaces and dashes.
 */

/**
 * The base class for the two identity DTOs, so the normalisation and the column `CHECK`
 * constraints are written once.
 */
export class IdentityFieldsDto {
  @Transform(readRequired)
  @IsString()
  @IsNotEmpty({ message: 'firstName is required' })
  firstName = ''

  @Transform(readRequired)
  @IsString()
  @IsNotEmpty({ message: 'lastName is required' })
  lastName = ''

  @Transform(readOptional)
  @IsOptional()
  @IsString()
  localFirstName: string | null = null

  @Transform(readOptional)
  @IsOptional()
  @IsString()
  localLastName: string | null = null

  @Transform(readDateOfBirth)
  @IsOptional()
  @IsDate()
  dateOfBirth: Date | null = null

  @Transform(readGender)
  @IsOptional()
  @IsIn(GENDERS)
  gender: Gender | null = null

  @Transform(readNationality)
  @IsOptional()
  @Matches(NATIONALITY_PATTERN, { message: 'nationality must be a two-letter country code in lower case' })
  nationality: string | null = null

  /** Stored normalised: upper case, no spaces or dashes. */
  @Transform(readPassport)
  @IsOptional()
  @IsString()
  @Matches(PASSPORT_PATTERN, { message: 'passportNumber must be uppercase letters and digits only' })
  passportNumber: string | null = null
}

import { BadRequestException } from '@nestjs/common'
import { Transform, type TransformFnParams } from 'class-transformer'
import { IsDate, IsIn, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator'

/**
 * The identity columns shared by `POST /api/staff/passengers` and
 * `PUT /api/staff/passengers/:id/identity`.
 *
 * `passenger.gender` is `CHECK (gender IN ('M', 'F', 'X'))` — see `src/db/schema.sql`.
 */
/** Exported so `CorrectIdentityDto` validates gender against the same list, not a second copy. */
export const GENDERS = ['M', 'F', 'X'] as const

export type Gender = (typeof GENDERS)[number]

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** A short country code in lower case (`th`, `hk`, `jp`, `mm`), per `src/db/schema.sql`. */
const NATIONALITY_PATTERN = /^[a-z]{2}$/

/** Passport is "uppercase letters and digits only" once normalised. */
const PASSPORT_PATTERN = /^[A-Z0-9]+$/

/**
 * The Artifact's DOB rule: not before 1900, and not after the current date.
 *
 * The upper bound stands in for "the simulation date" from the Artifact, because no
 * simulation clock ships in this repository — `schema.sql` marks the columns that are
 * meant to read from one, but there is nothing to read it from. Swap this for the real
 * clock when one lands; see the module README.
 */
const EARLIEST_DATE_OF_BIRTH_YEAR = 1900

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
  if (!ISO_DATE_PATTERN.test(trimmed)) {
    throw new BadRequestException('dateOfBirth must be an ISO date (YYYY-MM-DD)')
  }

  const [year, month, day] = trimmed.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  // Date.UTC silently rolls 31 February over into March; compare the parts back.
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new BadRequestException('dateOfBirth is not a real date')
  }
  if (year < EARLIEST_DATE_OF_BIRTH_YEAR) {
    throw new BadRequestException(`dateOfBirth must not be before ${EARLIEST_DATE_OF_BIRTH_YEAR}`)
  }
  // Stands in for "not after the simulation date"; see {@link EARLIEST_DATE_OF_BIRTH_YEAR}.
  if (date.getTime() > Date.now()) {
    throw new BadRequestException('dateOfBirth must not be in the future')
  }
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

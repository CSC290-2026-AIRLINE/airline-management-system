import { Transform } from 'class-transformer'
import { Equals, IsDate, IsIn, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator'
import { GENDERS, readDateOfBirth, readGender, readNationality, type Gender } from './identity-fields'

/** `schema.sql` calls for the raw value, so an absent or whitespace-only one is missing. */
function readReason({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value
}

/**
 * Body contract for `PUT /api/staff/passengers/:id/identity`.
 *
 * Only date of birth, gender and nationality are accepted. The Artifact's identity lock
 * is that those three "are set once, then only `PUT /staff/passengers/:id/identity`"
 * changes them, and `schema.sql` records the same rule, so a correction is restricted to
 * exactly those columns. Names, local spellings and the passport number are **not**
 * correctable through this route: they are not part of the identity lock, so they are left
 * out of the body entirely rather than being silently accepted and ignored.
 *
 * That also drops the full-restatement contract the previous `PATCH` body had. Because
 * `whitelist` drops undeclared properties, a client still sending the whole identity
 * record has its names and passport discarded rather than written — so the endpoint can no
 * longer be used to edit them.
 *
 * The readers are the same ones `IdentityFieldsDto` uses, so a value accepted here is
 * also accepted by the column `CHECK` constraints.
 */
export class CorrectIdentityDto {
  /** Optional: a passenger may have no date of birth on record, and clearing one is a correction. */
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
  @Matches(/^[a-z]{2}$/, { message: 'nationality must be a two-letter country code in lower case' })
  nationality: string | null = null

  /** Required, and copied verbatim into the audit row's `reason`. */
  @Transform(readReason)
  @IsString()
  @IsNotEmpty({ message: 'reason is required for an identity correction' })
  reason = ''

  /**
   * The dialog's confirmation checkbox. A correction is never applied without it.
   *
   * Deliberately has no initialiser: an absent flag has to fail `@Equals(true)`, and a
   * default of `true` would let a body that omits the field through.
   */
  @Equals(true, { message: 'confirm must be true to apply an identity correction' })
  confirm!: true
}

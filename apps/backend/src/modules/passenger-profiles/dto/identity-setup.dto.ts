import { Transform } from 'class-transformer'
import { IsIn, IsISO31661Alpha2, IsNotEmpty, IsString, Matches, MaxLength, Validate } from 'class-validator'
import { normalizePassportName } from '../identity-normalization'
import { BirthDateValidator, GENDERS } from './passenger-profiles.dto'

export class IdentitySetupDto {
  @Transform(({ value }: { value: unknown }) => normalizePassportName(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  @Matches(/^[A-Za-z][A-Za-z .'-]*$/)
  firstName!: string
  @Transform(({ value }: { value: unknown }) => normalizePassportName(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  @Matches(/^[A-Za-z][A-Za-z .'-]*$/)
  lastName!: string
  @Validate(BirthDateValidator)
  dateOfBirth!: string
  @IsIn(GENDERS)
  gender!: string
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsString()
  @IsISO31661Alpha2()
  nationality!: string
}

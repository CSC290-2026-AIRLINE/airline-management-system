import { IsEmail, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator'
import { CONTACT_PHONE_PATTERN } from './create-staff-lost-report.dto'

/** Body of `POST /api/staff/lost-reports/from-found-bag`: open a case for the owner of a tagged found bag. */
export class ReportFromFoundBagDto {
  @IsUUID()
  foundBagId: string

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  description?: string

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  contactEmail?: string

  @IsOptional()
  @IsString()
  @Matches(CONTACT_PHONE_PATTERN, { message: 'contactPhone must be digits, spaces, +, - or brackets' })
  contactPhone?: string
}

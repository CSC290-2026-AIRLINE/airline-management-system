import { IsEmail, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator'
import { IsPhoneNumber } from '../common/phone-number'

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
  @IsPhoneNumber()
  contactPhone?: string
}

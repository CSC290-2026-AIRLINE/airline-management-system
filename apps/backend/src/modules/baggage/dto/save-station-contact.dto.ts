import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator'
import { IsPhoneNumber } from '../common/phone-number'

/** Body of `PUT /api/staff/station-contacts/:airportCode`. The airport comes from the path. */
export class SaveStationContactDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  deskName: string

  @IsString()
  @IsPhoneNumber()
  phone: string

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string
}

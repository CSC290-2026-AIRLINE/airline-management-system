import { IsEmail, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator'

/** Body of `PUT /api/staff/station-contacts/:airportCode`. The airport comes from the path. */
export class SaveStationContactDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  deskName: string

  @IsString()
  @Matches(/^\+?[0-9 ()-]{6,30}$/, { message: 'phone must be digits, spaces, +, - or brackets' })
  phone: string

  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string
}

import { IsEmail, IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator'

/**
 * Body of `PUT /api/admin/staff/:id` — the whole Edit dialog in one request, so the name, email and role either all
 * save or none do. Every editable field is sent, changed or not; the service works out what actually changed.
 *
 * `email` may only differ from the stored one while the account is unclaimed (`EMAIL_LOCKED` otherwise).
 */
export class UpdateStaffDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  first_name: string

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  last_name: string

  @IsEmail()
  @MaxLength(254)
  email: string

  @IsUUID()
  role_id: string

  @IsString()
  @MaxLength(500)
  reason: string
}

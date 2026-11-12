import { IsBoolean, IsString, MaxLength } from 'class-validator'

/** Body of `PUT /api/admin/staff/:id/status`. `active: false` deactivates the account, `true` turns it back on. */
export class ChangeStaffStatusDto {
  @IsBoolean()
  active: boolean

  @IsString()
  @MaxLength(500)
  reason: string
}

import { IsNotEmpty, IsString, MaxLength } from 'class-validator'

/** Body of `POST /api/staff/lost-reports/:id/cancel`. The reason is kept in audit_log. */
export class CancelStaffLostReportDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string
}

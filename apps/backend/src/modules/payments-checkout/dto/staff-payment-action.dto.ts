import { IsOptional, IsString, MaxLength } from 'class-validator'

/**
 * The body of a staff action on a payment (retry the capture, void the authorisation).
 *
 * The note is optional in the mock. The audit trail is what makes it matter in the real implementation: Feature 15's
 * `AuditService` writes the `status_change` row.
 */
export class StaffPaymentActionDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string
}

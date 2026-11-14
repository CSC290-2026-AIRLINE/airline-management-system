import { IsString, MaxLength, MinLength } from 'class-validator'

/**
 * Body of `DELETE /api/admin/roles/:id`.
 *
 * A DELETE with a body is unusual, but this delete is an audited admin change and the audit row needs the reason, so
 * the body carries it. The service re-checks the length independently — the DTO only guards the HTTP path.
 */
export class DeleteRoleDto {
  @IsString()
  @MinLength(10, { message: 'reason must be at least 10 characters' })
  @MaxLength(500)
  reason: string
}

import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator'

/**
 * Body of `DELETE /api/admin/roles/:id`.
 *
 * A DELETE with a body is unusual, but this delete is an audited admin change and the audit row needs the reason, so
 * the body carries it. The service re-checks the length independently — the DTO only guards the HTTP path.
 *
 * `move_to_role_id` is where the staff who can sign in and hold the role are moved. Left out, they go to the No access
 * role. It cannot be an admin role or the role being deleted (`MOVE_TARGET_INVALID`).
 */
export class DeleteRoleDto {
  @IsString()
  @MinLength(10, { message: 'reason must be at least 10 characters' })
  @MaxLength(500)
  reason: string

  @IsOptional()
  @IsUUID('all', { message: 'move_to_role_id must be a role id' })
  move_to_role_id?: string
}

import { ArrayMaxSize, IsArray, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator'

/** 400 screens is far above any real role; the cap keeps one request from carrying the whole registry. */
const MAX_SCREENS_PER_ROLE = 400

/**
 * Body of `POST /api/admin/roles` — create a role, and optionally the screens it can open from the start.
 *
 * There is no `code` field on purpose: the admin types a role *name*, and the service derives the machine-readable
 * `role.code` from it. `role.code` is UNIQUE in the database and is what the audit log records as the actor's role, so
 * it has to exist — but it is not something an admin should have to invent.
 *
 * `reason` is required and strict, like every other admin change in this module: the row lands in the audit log and
 * has to say why in a sentence. The service re-checks the length independently — the DTO only guards the HTTP path.
 */
export class CreateRoleDto {
  @IsString()
  @IsNotEmpty({ message: 'name is required' })
  @MaxLength(100)
  name: string

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_SCREENS_PER_ROLE, { message: `a role cannot hold more than ${MAX_SCREENS_PER_ROLE} screens` })
  @IsUUID('4', { each: true })
  screen_ids?: string[]

  @IsString()
  @MinLength(10, { message: 'reason must be at least 10 characters' })
  @MaxLength(500)
  reason: string
}

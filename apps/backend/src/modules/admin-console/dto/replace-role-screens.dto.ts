import { ArrayMaxSize, IsArray, IsString, MaxLength, MinLength } from 'class-validator'

/** 400 screens is far above any real role; the cap keeps one request from carrying the whole registry. */
const MAX_SCREENS_PER_ROLE = 400

/**
 * Body of `PUT /api/admin/roles/:id/screens` — a full replace, not a delta. Sending `screen_ids: []` revokes every
 * grant on the role, which is a legitimate operation and still writes an audit row.
 *
 * `reason` is required and is deliberately strict: an access grant is a security-relevant change, so it has to say
 * why in a sentence. The service re-checks the length independently — the DTO only guards the HTTP path.
 */
export class ReplaceRoleScreensDto {
  @IsArray()
  @ArrayMaxSize(MAX_SCREENS_PER_ROLE, { message: `a role cannot hold more than ${MAX_SCREENS_PER_ROLE} screens` })
  @IsString({ each: true })
  screen_ids: string[]

  @IsString()
  @MinLength(10, { message: 'reason must be at least 10 characters' })
  @MaxLength(500)
  reason: string
}

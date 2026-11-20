import { IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator'

export const SCREEN_KINDS = ['core', 'admin', 'assignable'] as const
export type ScreenKind = (typeof SCREEN_KINDS)[number]

/** `f15.staff_roles`, `core.home`, `f03.seat_hold`: a prefix, a dot, then a snake_case name. */
export const SCREEN_CODE = /^[a-z0-9]+\.[a-z0-9_-]+$/

/** `15`, `03`, `3b`. */
export const FEATURE_NO = /^\d{1,3}[a-z]?$/

/**
 * One screen as the service registers it. Used by `registerScreen` / `registerSelfScreens`, which run at boot with no
 * HTTP request, so this is a plain shape rather than a validated body.
 */
export class RegisterScreenDto {
  code: string
  name: string
  kind?: ScreenKind
}

/**
 * Body of `POST /api/admin/screens`: an admin adds or renames one assignable screen by hand. Features register their
 * screens with `registerSelfScreens` at boot instead (see contracts/README.md).
 *
 * Only `assignable` screens can be added this way. A `core` screen appears on every role's menu and an `admin` screen on
 * every admin's, so those come from code (`registerSelfScreens`), never from a request. A reason is required and the
 * change is written to the audit log.
 */
export class RegisterScreenRequestDto {
  @IsString()
  @MaxLength(64)
  @Matches(SCREEN_CODE, { message: 'code must look like f<feature_no>.<snake_name>, e.g. f05.refunds' })
  code: string

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string

  @IsOptional()
  @IsIn(['assignable'], { message: 'only assignable screens can be registered over HTTP' })
  kind?: 'assignable'

  /** Groups the screen in the Role access matrix. Taken from the code (`f05.` → `05`) when left out. */
  @IsOptional()
  @IsString()
  @Matches(FEATURE_NO, { message: 'feature_no must be a feature number such as 5, 05 or 3b' })
  feature_no?: string

  @IsString()
  @MinLength(10, { message: 'reason must be at least 10 characters' })
  @MaxLength(500)
  reason: string
}

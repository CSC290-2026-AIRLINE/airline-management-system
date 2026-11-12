import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator'

export const SCREEN_KINDS = ['core', 'admin', 'assignable'] as const
export type ScreenKind = (typeof SCREEN_KINDS)[number]

/**
 * Body of `POST /api/admin/screens`. Every feature calls this on first boot to register its screens with the admin
 * console (see contracts/README.md). Idempotent on `code` (the unique key). `kind` defaults to 'assignable' so the
 * common case (a feature adding itself to the Role access matrix) is one field lighter.
 */
export class RegisterScreenDto {
  @IsString()
  @MaxLength(64)
  @Matches(/^[a-z0-9_-]+$/, { message: 'code must be lowercase alphanumeric (snake_name per the convention)' })
  code: string

  @IsString()
  @MaxLength(120)
  name: string

  @IsOptional()
  @IsIn(SCREEN_KINDS)
  kind?: ScreenKind
}

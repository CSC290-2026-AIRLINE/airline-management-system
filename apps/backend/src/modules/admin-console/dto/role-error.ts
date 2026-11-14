import { HttpException, HttpStatus } from '@nestjs/common'

/**
 * The error codes the Role access routes answer with. The frontend switches on the code to decide where the message
 * goes — under the name field, under the reason field, or in the dialog-level error box — so the code is the contract
 * and the text is not.
 *
 * Mirrors the Staff & roles codes (`staff.types.ts`) where the meaning is the same, and adds the role-specific ones.
 */
export type RoleErrorCode =
  | 'VALIDATION_FAILED'
  | 'REASON_REQUIRED'
  | 'ROLE_NOT_FOUND'
  | 'ROLE_NAME_TAKEN'
  | 'ROLE_CODE_TAKEN'
  | 'ROLE_IN_USE'
  | 'ROLE_NOT_DELETABLE'
  | 'SCREEN_NOT_ASSIGNABLE'

/**
 * The error shape the Role access screen reads: `{ error: { code, message, details? } }`.
 *
 * The Role access routes used to answer with Nest's default body (`{ statusCode, message, error }`), which the page
 * cannot read a code out of — so every failure looked the same and the UI could not tell "that role name is taken"
 * from "the server broke". This class gives those routes the same envelope the Staff & roles routes already use.
 */
export class RoleError extends HttpException {
  constructor(
    status: HttpStatus,
    readonly code: RoleErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super({ error: { code, message, ...(details ? { details } : {}) } }, status)
  }
}

/**
 * The `exceptionFactory` for `ParseUUIDPipe` on a role id — a malformed id is a role that does not exist, as far as the
 * caller is concerned. Same shape as `staffNotFound` in `staff.service.ts`.
 */
export function roleNotFound(): RoleError {
  return new RoleError(HttpStatus.NOT_FOUND, 'ROLE_NOT_FOUND', 'That role does not exist.')
}

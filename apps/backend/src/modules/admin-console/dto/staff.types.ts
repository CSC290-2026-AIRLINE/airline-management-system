/** Role summary embedded in a staff row, so the table can show the name without a second lookup. */
export interface StaffRoleRef {
  id: string
  code: string
  name: string
  is_admin: boolean
}

/** One row in `GET /admin/staff`, and the body returned by every staff write. */
export interface StaffRowDto {
  /** `staff.id` — the id used in `/admin/staff/:id`. */
  id: string
  user_id: string
  /** System-generated, e.g. `ST-0042`. Never editable. */
  staff_code: string
  first_name: string
  last_name: string
  email: string
  role: StaffRoleRef
  /** `true` while `user.disabled_at` is null. */
  active: boolean
  /** `true` once the person has signed in with Clerk; from then on the email is locked. */
  claimed: boolean
  last_sign_in_at: string | null
  created_at: string
}

/** Body of `GET /admin/staff`. */
export interface StaffListDto {
  staff: StaffRowDto[]
  /**
   * Best guess of the code the next created account will get (read from `staff_code_seq` without consuming it). Two
   * admins creating at the same moment can make it off by one; the create response always carries the real code.
   */
  next_staff_code: string
  /** `staff.id` of the signed-in admin, so the UI can show the "You" badge and block self-changes early. */
  viewer_staff_id: string
}

/** Error codes this module returns in `{ error: { code, message } }`. */
export type StaffErrorCode =
  | 'VALIDATION_FAILED'
  | 'REASON_REQUIRED'
  | 'EMAIL_TAKEN'
  | 'EMAIL_LOCKED'
  | 'ROLE_NOT_FOUND'
  | 'STAFF_NOT_FOUND'
  | 'SELF_DISABLE'
  | 'SELF_ROLE_CHANGE'
  | 'LAST_ADMIN'
  | 'NO_CHANGE'

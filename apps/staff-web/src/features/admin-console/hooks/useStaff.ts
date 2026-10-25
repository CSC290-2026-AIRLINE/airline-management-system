import { useEffect, useState } from 'react'
import { useListRoles } from '../api/roles'
import { StaffApiError, useStaffApi, type StaffCreateBody, type StaffStatusBody, type StaffUpdateBody } from '../api/staff'
import { previewRoles, previewStaff } from '../preview-data'
import type { RoleSummary, StaffErrorCode, StaffRow } from '../types'

/** Mirrors `MIN_REASON_LENGTH` in the backend's staff service — the same number, checked on both sides. */
export const MIN_REASON_LENGTH = 10

interface StaffState {
  loading: boolean
  error: StaffApiError | null
  staff: StaffRow[]
  roles: RoleSummary[]
  nextStaffCode: string
  viewerStaffId: string | null
}

function asStaffError(e: unknown): StaffApiError {
  if (e instanceof StaffApiError) return e
  // `useListRoles` throws plain `Error("403 Forbidden: …")`; keep its status so the page can tell 403 from a crash.
  const msg = e instanceof Error ? e.message : String(e)
  const status = Number(/\b(\d{3})\b/.exec(msg)?.[1] ?? 0)
  return new StaffApiError(status, `HTTP_${status}`, msg)
}

function fail(status: number, code: StaffErrorCode, message: string): never {
  throw new StaffApiError(status, code, message)
}

function replaceRow(list: StaffRow[], row: StaffRow): StaffRow[] {
  return list.map((s) => (s.id === row.id ? row : s))
}

function nextCode(code: string): string {
  return `ST-${String(Number(code.slice(3)) + 1).padStart(4, '0')}`
}

/**
 * Loads the staff list and the roles once, and owns the writes so the page only renders. Every successful write swaps
 * the row the server returned into the list — no refetch, so the table never flashes back to the old value.
 *
 * With `preview = true` (`?preview=1`) nothing touches the API: the list comes from `preview-data.ts` and the writes
 * run the same rules as the backend against that in-memory copy, so every dialog and error state of the design can be
 * reviewed without a database. Nothing is saved; a reload resets it.
 */
export function useStaff(preview: boolean) {
  const api = useStaffApi()
  const listRoles = useListRoles()
  const [state, setState] = useState<StaffState>(() =>
    preview
      ? {
          loading: false,
          error: null,
          staff: previewStaff.staff,
          roles: previewRoles.roles,
          nextStaffCode: previewStaff.next_staff_code,
          viewerStaffId: previewStaff.viewer_staff_id,
        }
      : { loading: true, error: null, staff: [], roles: [], nextStaffCode: '', viewerStaffId: null },
  )

  useEffect(() => {
    if (preview) return
    let cancelled = false
    ;(async () => {
      try {
        const [list, roles] = await Promise.all([api.list(), listRoles()])
        if (cancelled) return
        setState({
          loading: false,
          error: null,
          staff: list.staff,
          roles: roles.roles,
          nextStaffCode: list.next_staff_code,
          viewerStaffId: list.viewer_staff_id,
        })
      } catch (e: unknown) {
        if (cancelled) return
        setState((prev) => ({ ...prev, loading: false, error: asStaffError(e) }))
      }
    })()
    return () => {
      cancelled = true
    }
    // The API functions close over `fetchWithAuth`, which is recreated every render; see `useStaffApi`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview])

  async function create(body: StaffCreateBody): Promise<StaffRow> {
    const row = preview ? previewCreate(body) : await api.create(body)
    setState((prev) => ({
      ...prev,
      staff: [...prev.staff, row].sort((a, b) => a.staff_code.localeCompare(b.staff_code)),
      // The code just used is no longer a good guess for the next one.
      nextStaffCode: nextCode(row.staff_code > prev.nextStaffCode ? row.staff_code : prev.nextStaffCode),
    }))
    return row
  }

  async function update(id: string, body: StaffUpdateBody): Promise<StaffRow> {
    const row = preview ? previewUpdate(id, body) : await api.update(id, body)
    setState((prev) => ({ ...prev, staff: replaceRow(prev.staff, row) }))
    return row
  }

  async function setStatus(id: string, body: StaffStatusBody): Promise<StaffRow> {
    const row = preview ? previewSetStatus(id, body) : await api.setStatus(id, body)
    setState((prev) => ({ ...prev, staff: replaceRow(prev.staff, row) }))
    return row
  }

  /* Preview-mode stand-ins for the backend rules ------------------------------------------------------------------ */

  function requireReason(reason: string, message: string) {
    if (reason.trim().length < MIN_REASON_LENGTH) fail(400, 'REASON_REQUIRED', message)
  }

  function emailTaken(email: string, exceptId?: string) {
    return state.staff.some((s) => s.id !== exceptId && s.email.toLowerCase() === email.trim().toLowerCase())
  }

  function otherActiveAdmins(id: string) {
    return state.staff.filter((s) => s.id !== id && s.active && s.role.is_admin).length
  }

  function roleRef(roleId: string) {
    const r = state.roles.find((role) => role.id === roleId)
    if (!r) fail(400, 'ROLE_NOT_FOUND', 'The selected role does not exist.')
    return { id: r.id, code: r.code, name: r.name, is_admin: r.is_admin }
  }

  function findRow(id: string): StaffRow {
    const row = state.staff.find((s) => s.id === id)
    if (!row) fail(404, 'STAFF_NOT_FOUND', 'This staff account does not exist.')
    return row
  }

  function previewCreate(body: StaffCreateBody): StaffRow {
    requireReason(body.reason, 'A reason is required before creating this account.')
    if (emailTaken(body.email)) fail(409, 'EMAIL_TAKEN', 'This email is already used by another staff account.')
    const role = roleRef(body.role_id)
    const n = state.staff.length + 1000
    return {
      id: `p-staff-new-${n}`,
      user_id: `p-user-new-${n}`,
      staff_code: state.nextStaffCode,
      first_name: body.first_name.trim(),
      last_name: body.last_name.trim(),
      email: body.email.trim().toLowerCase(),
      role,
      active: true,
      claimed: false,
      last_sign_in_at: null,
      created_at: new Date().toISOString(),
    }
  }

  function previewUpdate(id: string, body: StaffUpdateBody): StaffRow {
    const row = findRow(id)
    const email = body.email.trim().toLowerCase()
    const nameChanged = body.first_name.trim() !== row.first_name || body.last_name.trim() !== row.last_name
    const emailChanged = email !== row.email.toLowerCase()
    const roleChanged = body.role_id !== row.role.id
    if (!nameChanged && !emailChanged && !roleChanged) {
      fail(400, 'NO_CHANGE', 'No account details changed. Nothing was saved or added to the audit log.')
    }
    if (roleChanged && id === state.viewerStaffId) {
      fail(409, 'SELF_ROLE_CHANGE', "You can't change your own role. Ask another Admin to make this change. Nothing was saved.")
    }
    requireReason(body.reason, 'A reason is required before saving.')
    if (emailChanged && row.claimed) {
      fail(409, 'EMAIL_LOCKED', 'This account was claimed at its first Clerk sign-in, so the work email can no longer be changed.')
    }
    if (emailChanged && emailTaken(email, id)) fail(409, 'EMAIL_TAKEN', 'This email is already used by another staff account.')
    const role = roleRef(body.role_id)
    if (roleChanged && row.role.is_admin && !role.is_admin && row.active && otherActiveAdmins(id) === 0) {
      fail(409, 'LAST_ADMIN', `${row.first_name} ${row.last_name} is the last active Admin. Nothing was changed.`)
    }
    return { ...row, first_name: body.first_name.trim(), last_name: body.last_name.trim(), email, role }
  }

  function previewSetStatus(id: string, body: StaffStatusBody): StaffRow {
    const row = findRow(id)
    if (!body.active && id === state.viewerStaffId) fail(409, 'SELF_DISABLE', "You can't deactivate your own account.")
    if (row.active === body.active) fail(400, 'NO_CHANGE', 'Nothing was saved.')
    requireReason(
      body.reason,
      body.active ? 'A reason is required before activating this account.' : 'A reason is required before deactivating this account.',
    )
    if (!body.active && row.role.is_admin && otherActiveAdmins(id) === 0) {
      fail(409, 'LAST_ADMIN', `${row.first_name} ${row.last_name} is the last active Admin. Nothing was changed.`)
    }
    return { ...row, active: body.active }
  }

  return { ...state, create, update, setStatus }
}

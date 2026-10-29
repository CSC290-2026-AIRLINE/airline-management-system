import { useEffect, useState } from 'react'
import { useListRoles } from '../api/roles'
import { StaffApiError, useStaffApi, type StaffCreateBody, type StaffStatusBody, type StaffUpdateBody } from '../api/staff'
import type { RoleSummary, StaffRow } from '../types'

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

function replaceRow(list: StaffRow[], row: StaffRow): StaffRow[] {
  return list.map((s) => (s.id === row.id ? row : s))
}

function nextCode(code: string): string {
  return `ST-${String(Number(code.slice(3)) + 1).padStart(4, '0')}`
}

/**
 * Loads the staff list and the roles once, and owns the writes so the page only renders. Every successful write swaps
 * the row the server returned into the list — no refetch, so the table never flashes back to the old value.
 */
export function useStaff() {
  const api = useStaffApi()
  const listRoles = useListRoles()
  const [state, setState] = useState<StaffState>({
    loading: true,
    error: null,
    staff: [],
    roles: [],
    nextStaffCode: '',
    viewerStaffId: null,
  })

  useEffect(() => {
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
  }, [])

  async function create(body: StaffCreateBody): Promise<StaffRow> {
    const row = await api.create(body)
    setState((prev) => ({
      ...prev,
      staff: [...prev.staff, row].sort((a, b) => a.staff_code.localeCompare(b.staff_code)),
      // The code just used is no longer a good guess for the next one.
      nextStaffCode: nextCode(row.staff_code > prev.nextStaffCode ? row.staff_code : prev.nextStaffCode),
    }))
    return row
  }

  async function update(id: string, body: StaffUpdateBody): Promise<StaffRow> {
    const row = await api.update(id, body)
    setState((prev) => ({ ...prev, staff: replaceRow(prev.staff, row) }))
    return row
  }

  async function setStatus(id: string, body: StaffStatusBody): Promise<StaffRow> {
    const row = await api.setStatus(id, body)
    setState((prev) => ({ ...prev, staff: replaceRow(prev.staff, row) }))
    return row
  }

  return { ...state, create, update, setStatus }
}

import { useAppAuth } from '@staff-web/auth/AuthProvider'
import type { CaseStatus, Complaint } from './types'

/** The backend's error message ("Case … not found", a validation message) instead of a bare status code. */
async function errorFrom(res: Response): Promise<Error> {
  const body = (await res.json().catch(() => null)) as { message?: string | string[] } | null
  const message = Array.isArray(body?.message) ? body.message.join(', ') : body?.message
  return new Error(message || `Request failed (${res.status})`)
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : 'Something went wrong'
}

/**
 * The staff complaints endpoints. `fetchWithAuth` is not memoised, so this is rebuilt every render: call it from event
 * handlers or effect events, never list it as an effect dependency.
 */
export function useComplaintsApi() {
  const { fetchWithAuth } = useAppAuth()

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetchWithAuth(`/api/staff/complaints${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    })
    if (!res.ok) throw await errorFrom(res)
    return (await res.json()) as T
  }

  return {
    list: () => request<Complaint[]>(''),
    get: (id: string) => request<Complaint>(`/${id}`),
    setStatus: (id: string, status: CaseStatus) =>
      request<Complaint>(`/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    addNote: (id: string, note: string) => request<Complaint>(`/${id}/notes`, { method: 'POST', body: JSON.stringify({ note }) }),
  }
}

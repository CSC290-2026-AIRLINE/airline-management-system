import { useAppAuth } from '@customer-web/auth/AuthProvider'
import type { Complaint, NewComplaint } from './types'

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : 'Something went wrong'
}

/**
 * The signed-in customer's complaint endpoints. `fetchWithAuth` is not memoised, so this is rebuilt every render: call it
 * from event handlers or effect events, never list it as an effect dependency.
 */
export function useComplaintsApi() {
  const { fetchWithAuth } = useAppAuth()

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetchWithAuth(`/api/complaints${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    })
    if (!res.ok) {
      // Show the backend's own message, e.g. "No flight TG101 on 2026-11-01".
      const body = (await res.json().catch(() => null)) as { message?: string | string[] } | null
      const message = Array.isArray(body?.message) ? body.message.join(', ') : body?.message
      throw new Error(message || `Request failed (${res.status})`)
    }
    return (await res.json()) as T
  }

  return {
    create: (complaint: NewComplaint) => request<Complaint>('', { method: 'POST', body: JSON.stringify(complaint) }),
    list: () => request<Complaint[]>(''),
    get: (caseNumber: string) => request<Complaint>(`/${encodeURIComponent(caseNumber)}`),
  }
}

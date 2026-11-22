import { useAppAuth } from '@customer-web/auth/AuthProvider'
import type { Complaint, NewComplaint, NotificationPreferenceRow } from './types'

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : 'Something went wrong'
}

export function useComplaintsApi() {
  const { fetchWithAuth } = useAppAuth()

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const url = path.startsWith('/api/') ? path : `/api/complaints${path}`
    const res = await fetchWithAuth(url, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    })
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { message?: string | string[] } | null
      const message = Array.isArray(body?.message) ? body.message.join(', ') : body?.message
      throw new Error(message || `Request failed (${res.status})`)
    }
    return (await res.json()) as T
  }

  return {
    create: (complaint: NewComplaint) => request<Complaint>('', { method: 'POST', body: JSON.stringify(complaint) }),
    list: () => request<Complaint[]>(''),
    get: (caseNumber: string) => request<Complaint>(`/${encodeURIComponent(caseNumber.trim().toUpperCase())}`),
    getNotificationPreferences: () => request<NotificationPreferenceRow[]>('/api/customers/me/notification-preferences'),
    updateNotificationPreferences: (preferences: NotificationPreferenceRow[]) =>
      request<NotificationPreferenceRow[]>('/api/customers/me/notification-preferences', {
        method: 'PUT',
        // The API accepts only these four fields; the labels from GET would be refused.
        body: JSON.stringify({ preferences: preferences.map(({ typeCode, email, sms, push }) => ({ typeCode, email, sms, push })) }),
      }),
  }
}

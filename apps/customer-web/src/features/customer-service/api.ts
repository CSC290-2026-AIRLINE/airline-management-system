import { useAppAuth } from '@customer-web/auth/AuthProvider'
import type { Complaint, NewComplaint, NotificationPreferenceRow } from './types'

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : 'Something went wrong'
}

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8080'

export function useComplaintsApi() {
  const { fetchWithAuth, user } = useAppAuth()

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

  async function createGuest(complaint: NewComplaint): Promise<Complaint> {
    const res = await fetch(`${API_URL}/api/complaints/guest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(complaint),
    })
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { message?: string | string[] } | null
      const message = Array.isArray(body?.message) ? body.message.join(', ') : body?.message
      throw new Error(message || `Request failed (${res.status})`)
    }
    return (await res.json()) as Complaint
  }

  async function getGuest(caseNumber: string, bookingReference?: string, surname?: string): Promise<Complaint> {
    const params = new URLSearchParams()
    if (bookingReference && bookingReference.trim()) params.set('booking_reference', bookingReference.trim().toUpperCase())
    if (surname && surname.trim()) params.set('surname', surname.trim())
    const qs = params.toString() ? `?${params.toString()}` : ''
    const res = await fetch(`${API_URL}/api/complaints/guest/${encodeURIComponent(caseNumber.trim().toUpperCase())}${qs}`)
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { message?: string | string[] } | null
      const message = Array.isArray(body?.message) ? body.message.join(', ') : body?.message
      throw new Error(message || `Request failed (${res.status})`)
    }
    return (await res.json()) as Complaint
  }

  return {
    create: (complaint: NewComplaint) =>
      user && !complaint.booking_reference
        ? request<Complaint>('', { method: 'POST', body: JSON.stringify(complaint) })
        : createGuest(complaint),
    createGuest,
    list: () => request<Complaint[]>(''),
    get: async (caseNumber: string, bookingReference?: string, surname?: string) => {
      if (!user) {
        return getGuest(caseNumber, bookingReference, surname)
      }
      return request<Complaint>(`/${encodeURIComponent(caseNumber.trim().toUpperCase())}`)
    },
    getGuest,
    getNotificationPreferences: () => request<NotificationPreferenceRow[]>('/api/customers/me/notification-preferences'),
    updateNotificationPreferences: (preferences: NotificationPreferenceRow[]) =>
      request<NotificationPreferenceRow[]>('/api/customers/me/notification-preferences', {
        method: 'PUT',
        // The API accepts only these four fields; the labels from GET would be refused.
        body: JSON.stringify({ preferences: preferences.map(({ typeCode, email, sms, push }) => ({ typeCode, email, sms, push })) }),
      }),
  }
}

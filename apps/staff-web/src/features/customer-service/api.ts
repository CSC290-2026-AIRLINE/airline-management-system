import { useAppAuth } from '@staff-web/auth/AuthProvider'
import type {
  CaseStatus,
  Complaint,
  StaffChartsResponse,
  StaffDeliveryLogResponse,
  StaffTemplateItemView,
  UpdateTemplatePayload,
} from './types'

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : 'Something went wrong'
}

export function useComplaintsApi() {
  const { fetchWithAuth } = useAppAuth()

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetchWithAuth(`/api/staff/complaints${path}`, {
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
    list: () => request<Complaint[]>(''),
    get: (id: string) => request<Complaint>(`/${id}`),
    getMe: () => request<{ id: string; name: string; roleCode: string; roleName: string; isSupervisor: boolean }>('/me'),
    getStaffMembers: () => request<{ id: string; name: string; roleCode: string }[]>('/staff-members'),
    assignOwner: (id: string, staffId: string) =>
      request<Complaint>(`/${id}/assign`, { method: 'PATCH', body: JSON.stringify({ staffId }) }),
    setStatus: (id: string, status: CaseStatus, resolutionNote?: string) =>
      request<Complaint>(`/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status, resolutionNote }) }),
    addNote: (id: string, note: string) => request<Complaint>(`/${id}/notes`, { method: 'POST', body: JSON.stringify({ note }) }),
    sendCompensation: (id: string, comp: { type: string; amount: number; reason: string }) =>
      request<Complaint>(`/${id}/compensation`, { method: 'POST', body: JSON.stringify(comp) }),
    getCharts: () => request<StaffChartsResponse>('/charts'),
    getDeliveryLog: () => request<StaffDeliveryLogResponse>('/delivery-log'),
    retryNotification: (id: string) =>
      request<{ id: string; status: string }>(`/delivery-log/${id}/retry`, { method: 'POST' }),
    setMockFailure: (fail: boolean) =>
      request<{ mockFailure: boolean }>('/delivery-log/mock-failure', { method: 'POST', body: JSON.stringify({ fail }) }),
    getTemplates: () => request<StaffTemplateItemView[]>('/templates'),
    updateTemplate: (code: string, payload: UpdateTemplatePayload) =>
      request<StaffTemplateItemView[]>(`/templates/${code}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
  }
}

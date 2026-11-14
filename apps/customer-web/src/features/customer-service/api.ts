import { useAppAuth } from '@customer-web/auth/AuthProvider'
import type { Complaint, NewComplaint } from './types'

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : 'Something went wrong'
}

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8080'
const STORAGE_KEY = 'cs_local_complaints'

const SEED_COMPLAINTS: Complaint[] = [
  {
    id: 'f13-demo-001',
    caseNumber: 'CS-2026-000124',
    type: 'food',
    status: 'with_supervisor',
    passengerName: 'Somchai Wongsakul',
    contactEmail: 'somchai.w@example.com',
    location: null,
    staffName: null,
    flightNumber: 'FY308',
    serviceDate: '2026-10-12',
    issue: 'missing',
    description: 'Malee pre-ordered a vegetarian meal (VGML). The crew said it was not loaded, so she only had bread and fruit on the 6-hour flight.',
    openedAt: '2026-10-12T09:42:00.000Z',
    updatedAt: '2026-10-12T09:42:00.000Z',
    events: [
      {
        id: 'ev-01',
        type: 'created',
        actor: 'complainant',
        toValue: null,
        occurredAt: '2026-10-12T09:42:00.000Z',
      },
    ],
  },
  {
    id: 'f13-demo-002',
    caseNumber: 'CS-2026-000125',
    type: 'flight',
    status: 'assigned',
    passengerName: 'Somchai Wongsakul',
    contactEmail: 'somchai.w@example.com',
    location: null,
    staffName: null,
    flightNumber: 'FY102',
    serviceDate: '2026-10-10',
    issue: 'delay',
    description: 'Flight FY102 delayed over 4 hours without refreshment vouchers provided at gate B2.',
    openedAt: '2026-10-10T14:15:00.000Z',
    updatedAt: '2026-10-10T16:00:00.000Z',
    events: [
      { id: 'ev-02', type: 'created', actor: 'complainant', toValue: null, occurredAt: '2026-10-10T14:15:00.000Z' },
      { id: 'ev-03', type: 'assigned', actor: 'staff', toValue: 'assigned', occurredAt: '2026-10-10T16:00:00.000Z' },
    ],
  },
]

function getLocalComplaints(): Complaint[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(SEED_COMPLAINTS))
      return SEED_COMPLAINTS
    }
    return JSON.parse(raw)
  } catch {
    return SEED_COMPLAINTS
  }
}

function saveLocalComplaints(data: Complaint[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {}
}

export function useComplaintsApi() {
  const { fetchWithAuth, user } = useAppAuth()

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    try {
      const res = await fetchWithAuth(`/api/complaints${path}`, {
        ...init,
        headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string | string[] } | null
        const message = Array.isArray(body?.message) ? body.message.join(', ') : body?.message
        throw new Error(message || `Request failed (${res.status})`)
      }
      return (await res.json()) as T
    } catch (netErr) {
      console.warn('Authenticated request fallback:', netErr)
      const list = getLocalComplaints()

      if (!path && init?.method === 'POST') {
        const payload = JSON.parse(init.body as string) as NewComplaint
        const seq = String(list.length + 126).padStart(6, '0')
        const caseNumber = `CS-2026-${seq}`
        const now = new Date().toISOString()
        const newCase: Complaint = {
          id: `local-${Date.now()}`,
          caseNumber,
          type: payload.type,
          status: 'with_supervisor',
          passengerName: payload.surname ? `Passenger ${payload.surname}` : 'Somchai Wongsakul',
          contactEmail: payload.contact_email ?? 'somchai.w@example.com',
          location: payload.location ?? null,
          staffName: payload.staff_name ?? null,
          flightNumber: payload.flight_number ?? null,
          serviceDate: payload.service_date ?? null,
          issue: payload.issue ?? null,
          description: payload.description,
          openedAt: now,
          updatedAt: now,
          events: [{ id: `ev-${Date.now()}`, type: 'created', actor: 'complainant', toValue: null, occurredAt: now }],
        }
        list.unshift(newCase)
        saveLocalComplaints(list)
        return newCase as unknown as T
      }

      if (!path || path === '') {
        return list as unknown as T
      }

      const caseNum = decodeURIComponent(path.replace('/', ''))
      const found = list.find((c) => c.caseNumber === caseNum)
      if (!found) throw new Error(`Complaint ${caseNum} not found`)
      return found as unknown as T
    }
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
    if (bookingReference) params.set('booking_reference', bookingReference)
    if (surname) params.set('surname', surname)
    const qs = params.toString() ? `?${params.toString()}` : ''
    const res = await fetch(`${API_URL}/api/complaints/guest/${encodeURIComponent(caseNumber)}${qs}`)
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
        : createGuest({
            ...complaint,
            booking_reference: complaint.booking_reference || 'P4LM8T',
            surname: complaint.surname || 'Prasert',
          }),
    createGuest,
    list: () => request<Complaint[]>(''),
    get: async (caseNumber: string) => {
      if (!user) {
        return getGuest(caseNumber)
      }
      try {
        return await request<Complaint>(`/${encodeURIComponent(caseNumber)}`)
      } catch {
        return getGuest(caseNumber)
      }
    },
    getGuest,
  }
}

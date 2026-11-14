import { useAppAuth } from '@staff-web/auth/AuthProvider'
import type {
  CaseEvent,
  CaseStatus,
  Complaint,
  CompensationDecision,
  StaffChartsResponse,
  StaffDeliveryLogResponse,
  StaffTemplateItemView,
  UpdateTemplatePayload,
} from './types'

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : 'Something went wrong'
}

const STORAGE_KEY = 'cs_local_complaints_v3'

function makeEvent(
  id: string,
  type: string,
  actor: 'staff' | 'complainant' | 'system',
  actorName: string | null,
  toValue: string | null = null,
  note: string | null = null,
  isInternal: boolean = false,
  occurredAt: string = new Date().toISOString(),
  timeLabel?: string,
  actorLabel?: string,
  title?: string,
): CaseEvent {
  return {
    id,
    type,
    actor,
    actorName,
    fromValue: null,
    toValue,
    note,
    isInternal,
    occurredAt,
    timeLabel,
    actorLabel,
    title,
  }
}

export const SEED_STAFF_COMPLAINTS: Complaint[] = [
  {
    id: 'f13-000125',
    caseNumber: 'CS-2026-000125',
    type: 'food',
    status: 'with_supervisor',
    passengerName: 'Somchai Wongsakul',
    contactEmail: 'somchai.w@example.com',
    ownerName: null,
    location: null,
    staffName: null,
    flightNumber: 'FY308',
    serviceDate: '2026-10-12',
    issue: 'missing',
    summary: 'Sent again: VGML meal not loaded',
    fromSource: 'Customer',
    age: '2 min',
    unread: true,
    bookingRef: 'FLY7K2',
    flightRoute: 'FY308 · BKK → NRT · Mon 12 Oct',
    mealDetail: 'Vegetarian meal (VGML) · Malee',
    openedLabel: 'Opened 12 Oct 20:28 by the customer',
    description: 'Malee pre-ordered a vegetarian meal (VGML). Submitting again to make sure it reached the supervisor team.',
    openedAt: '2026-10-12T20:28:00.000Z',
    resolvedAt: null,
    closedAt: null,
    updatedAt: '2026-10-12T20:28:00.000Z',
    events: [
      makeEvent('ev-125-1', 'created', 'system', 'System', null, null, false, '2026-10-12T20:28:00.000Z', '12 Oct 20:28', 'System', 'Created by customer (somchai.w@example.com)'),
      makeEvent('ev-125-2', 'routed', 'system', 'System', null, null, false, '2026-10-12T20:28:00.000Z', '12 Oct 20:28', 'System', 'Routed to Customer Service supervisor'),
      makeEvent('ev-125-3', 'email_sent', 'system', 'System', null, null, false, '2026-10-12T20:29:00.000Z', '12 Oct 20:29', 'System', 'Email sent: case received'),
    ],
  },
  {
    id: 'f13-000124',
    caseNumber: 'CS-2026-000124',
    type: 'food',
    status: 'with_supervisor',
    passengerName: 'Somchai Wongsakul',
    contactEmail: 'somchai.w@example.com',
    ownerName: null,
    location: null,
    staffName: null,
    flightNumber: 'FY308',
    serviceDate: '2026-10-12',
    issue: 'missing',
    summary: 'Malee’s VGML meal not loaded',
    fromSource: 'Customer',
    age: '16 min',
    unread: true,
    bookingRef: 'FLY7K2',
    flightRoute: 'FY308 · BKK → NRT · Mon 12 Oct',
    mealDetail: 'Vegetarian meal (VGML) · Malee',
    openedLabel: 'Opened 12 Oct 20:14 by the customer',
    description: 'Malee pre-ordered a vegetarian meal (VGML). The crew said it was not loaded, so she only had bread and fruit on the 6-hour flight.',
    openedAt: '2026-10-12T20:14:00.000Z',
    resolvedAt: null,
    closedAt: null,
    updatedAt: '2026-10-12T20:14:00.000Z',
    events: [
      makeEvent('ev-124-1', 'created', 'system', 'System', null, null, false, '2026-10-12T20:14:00.000Z', '12 Oct 20:14', 'System', 'Created by customer (somchai.w@example.com)'),
      makeEvent('ev-124-2', 'routed', 'system', 'System', null, null, false, '2026-10-12T20:14:00.000Z', '12 Oct 20:14', 'System', 'Routed to Customer Service supervisor'),
      makeEvent('ev-124-3', 'email_sent', 'system', 'System', null, null, false, '2026-10-12T20:15:00.000Z', '12 Oct 20:15', 'System', 'Email sent: case received'),
    ],
  },
  {
    id: 'f13-000123',
    caseNumber: 'CS-2026-000123',
    type: 'flight',
    status: 'with_supervisor',
    passengerName: 'Ananda Silva',
    contactEmail: 'ananda.s@example.com',
    ownerName: null,
    location: null,
    staffName: null,
    flightNumber: 'FY405',
    serviceDate: '2026-10-12',
    issue: 'cancellation',
    summary: 'Flight cancelled, rebooked next day',
    fromSource: 'Customer',
    age: '6 h',
    unread: false,
    bookingRef: 'K8N2P4',
    flightRoute: 'FY405 · SIN → BKK · Mon 12 Oct',
    mealDetail: '—',
    openedLabel: 'Opened 12 Oct 14:15 by the customer',
    description: 'Our flight FY405 was cancelled two hours before departure and we were rebooked onto the next morning flight without hotel details.',
    openedAt: '2026-10-12T14:15:00.000Z',
    resolvedAt: null,
    closedAt: null,
    updatedAt: '2026-10-12T14:15:00.000Z',
    events: [
      makeEvent('ev-123-1', 'created', 'system', 'System', null, null, false, '2026-10-12T14:15:00.000Z', '12 Oct 14:15', 'System', 'Created by customer (ananda.s@example.com)'),
      makeEvent('ev-123-2', 'routed', 'system', 'System', null, null, false, '2026-10-12T14:15:00.000Z', '12 Oct 14:15', 'System', 'Routed to Customer Service supervisor'),
    ],
  },
  {
    id: 'f13-000122',
    caseNumber: 'CS-2026-000122',
    type: 'employee',
    status: 'with_supervisor',
    passengerName: 'Somchai Prasert',
    contactEmail: 's.prasert@example.com',
    ownerName: null,
    location: 'call_centre',
    staffName: 'Call centre agent',
    flightNumber: 'FY402',
    serviceDate: '2026-10-09',
    issue: 'discourtesy',
    summary: 'Call centre agent hung up twice',
    fromSource: 'No account',
    age: '11 h',
    unread: false,
    bookingRef: 'P4LM8T',
    flightRoute: 'FY402 · BKK → CNX · Fri 9 Oct',
    mealDetail: 'Call centre',
    openedLabel: 'Opened 12 Oct 09:20 by a passenger without an account',
    description: 'Called twice to change a seat assignment and the agent hung up while I was reading out my booking reference.',
    openedAt: '2026-10-12T09:20:00.000Z',
    resolvedAt: null,
    closedAt: null,
    updatedAt: '2026-10-12T09:20:00.000Z',
    events: [
      makeEvent('ev-122-1', 'created', 'system', 'System', null, null, false, '2026-10-12T09:20:00.000Z', '12 Oct 09:20', 'System', 'Created by passenger without an account (s.prasert@example.com)'),
      makeEvent('ev-122-2', 'routed', 'system', 'System', null, null, false, '2026-10-12T09:20:00.000Z', '12 Oct 09:20', 'System', 'Routed to Customer Service supervisor'),
    ],
  },
  {
    id: 'f13-000119',
    caseNumber: 'CS-2026-000119',
    type: 'employee',
    status: 'with_supervisor',
    passengerName: 'Niran Kittisup',
    contactEmail: 'niran.k@example.com',
    ownerName: null,
    location: 'gate',
    staffName: 'Gate agent at B5',
    flightNumber: 'FY403',
    serviceDate: '2026-10-07',
    issue: 'discourtesy',
    summary: 'Gate agent rude about cabin bag',
    fromSource: 'Customer',
    age: '2 d',
    unread: false,
    bookingRef: 'M2R9Q1',
    flightRoute: 'FY403 · ICN → BKK · Wed 7 Oct',
    mealDetail: 'Gate B5',
    openedLabel: 'Opened 10 Oct 16:40 by the customer',
    description: 'Gate agent at B5 spoke rudely about my cabin bag even though it fit comfortably inside the sizing frame.',
    openedAt: '2026-10-10T16:40:00.000Z',
    resolvedAt: null,
    closedAt: null,
    updatedAt: '2026-10-10T16:40:00.000Z',
    events: [
      makeEvent('ev-119-1', 'created', 'system', 'System', null, null, false, '2026-10-10T16:40:00.000Z', '10 Oct 16:40', 'System', 'Created by customer (niran.k@example.com)'),
    ],
  },
  {
    id: 'f13-000117',
    caseNumber: 'CS-2026-000117',
    type: 'flight',
    status: 'with_supervisor',
    passengerName: 'Anna Lee',
    contactEmail: 'anna.lee@example.com',
    ownerName: null,
    location: null,
    staffName: null,
    flightNumber: 'FY405',
    serviceDate: '2026-10-09',
    issue: 'delay',
    summary: '3-hour delay, no updates at the gate',
    fromSource: 'Customer',
    age: '3 d',
    unread: false,
    bookingRef: 'W9X4B2',
    flightRoute: 'FY405 · SIN → BKK · Fri 9 Oct',
    mealDetail: '—',
    openedLabel: 'Opened 9 Oct 19:10 by the customer',
    description: 'Flight FY405 was delayed by 3 hours and there were no announcements at the gate for over 90 minutes.',
    openedAt: '2026-10-09T19:10:00.000Z',
    resolvedAt: null,
    closedAt: null,
    updatedAt: '2026-10-09T19:10:00.000Z',
    events: [
      makeEvent('ev-117-1', 'created', 'system', 'System', null, null, false, '2026-10-09T19:10:00.000Z', '9 Oct 19:10', 'System', 'Created by customer (anna.lee@example.com)'),
    ],
  },
  {
    id: 'f13-000115',
    caseNumber: 'CS-2026-000115',
    type: 'flight',
    status: 'with_supervisor',
    passengerName: 'Chloe Martin',
    contactEmail: 'chloe.m@example.com',
    ownerName: null,
    location: null,
    staffName: null,
    flightNumber: 'FY401',
    serviceDate: '2026-09-30',
    issue: 'baggage',
    summary: 'Lost bag: no match after 21 days',
    fromSource: 'Feature 10',
    age: '12 d',
    unread: false,
    bookingRef: 'B3T7V9',
    flightRoute: 'FY401 · LHR → BKK · Wed 30 Sep',
    mealDetail: 'Tag FY 451002',
    openedLabel: 'Opened 30 Sep 11:05 by Feature 10',
    description: 'Escalated automatically from Feature 10: checked bag Tag FY 451002 has had no tracer match after 21 days.',
    openedAt: '2026-09-30T11:05:00.000Z',
    resolvedAt: null,
    closedAt: null,
    updatedAt: '2026-09-30T11:05:00.000Z',
    events: [
      makeEvent('ev-115-1', 'created', 'system', 'System', null, null, false, '2026-09-30T11:05:00.000Z', '30 Sep 11:05', 'Feature 10', 'Escalated automatically from Feature 10 (Tag FY 451002)'),
    ],
  },
  {
    id: 'f13-000121',
    caseNumber: 'CS-2026-000121',
    type: 'food',
    status: 'assigned',
    passengerName: 'Mai Tran',
    contactEmail: 'mai.t@example.com',
    ownerName: 'Ploy Wong',
    location: null,
    staffName: null,
    flightNumber: 'FY402',
    serviceDate: '2026-10-09',
    issue: 'allergy',
    summary: 'Nut allergy, snack had peanuts',
    fromSource: 'Customer',
    age: '1 d',
    unread: false,
    bookingRef: 'C5D8J1',
    flightRoute: 'FY402 · BKK → CNX · Fri 9 Oct',
    mealDetail: 'Snack box · Seat 14A',
    openedLabel: 'Opened 11 Oct 14:22 by the customer',
    description: 'Booking noted a severe nut allergy, but the snack handed out included roasted peanuts without clear allergen labelling.',
    openedAt: '2026-10-11T14:22:00.000Z',
    resolvedAt: null,
    closedAt: null,
    updatedAt: '2026-10-11T15:00:00.000Z',
    events: [
      makeEvent('ev-121-1', 'created', 'system', 'System', null, null, false, '2026-10-11T14:22:00.000Z', '11 Oct 14:22', 'System', 'Created by customer (mai.t@example.com)'),
      makeEvent('ev-121-2', 'assigned', 'staff', 'Tong Charoen', 'Ploy Wong', null, false, '2026-10-11T15:00:00.000Z', '11 Oct 15:00', 'Tong Charoen', 'Assigned to Ploy Wong'),
    ],
  },
  {
    id: 'f13-000118',
    caseNumber: 'CS-2026-000118',
    type: 'food',
    status: 'assigned',
    passengerName: 'Kanda Srisuk',
    contactEmail: 'kanda.s@example.com',
    ownerName: 'Ploy Wong',
    location: null,
    staffName: null,
    flightNumber: 'FY308',
    serviceDate: '2026-10-08',
    issue: 'wrong_meal',
    summary: 'Got chicken, booked vegetarian',
    fromSource: 'No account',
    age: '3 d',
    unread: false,
    bookingRef: 'H7L3N6',
    flightRoute: 'FY308 · BKK → NRT · Thu 8 Oct',
    mealDetail: 'Vegetarian meal (VGML)',
    openedLabel: 'Opened 9 Oct 10:12 by a passenger without an account',
    description: 'Booked vegetarian meal on booking H7L3N6 but was served chicken curry because catering ran out of VGML.',
    openedAt: '2026-10-09T10:12:00.000Z',
    resolvedAt: null,
    closedAt: null,
    updatedAt: '2026-10-09T11:30:00.000Z',
    events: [
      makeEvent('ev-118-1', 'created', 'system', 'System', null, null, false, '2026-10-09T10:12:00.000Z', '9 Oct 10:12', 'System', 'Created by passenger without an account (kanda.s@example.com)'),
      makeEvent('ev-118-2', 'assigned', 'staff', 'Tong Charoen', 'Ploy Wong', null, false, '2026-10-09T11:30:00.000Z', '9 Oct 11:30', 'Tong Charoen', 'Assigned to Ploy Wong'),
    ],
  },
  {
    id: 'f13-000120',
    caseNumber: 'CS-2026-000120',
    type: 'flight',
    status: 'resolved',
    passengerName: 'Tom Baker',
    contactEmail: 'tom.b@example.com',
    ownerName: 'Mali Rattana',
    location: null,
    staffName: null,
    flightNumber: 'FY405',
    serviceDate: '2026-10-09',
    issue: 'delay',
    summary: 'Missed connection in BKK after delay',
    fromSource: 'Customer',
    age: '2 d',
    unread: false,
    bookingRef: 'R4V8Z1',
    flightRoute: 'FY405 · SIN → BKK · Fri 9 Oct',
    mealDetail: '—',
    openedLabel: 'Opened 10 Oct 11:00 by the customer',
    description: 'Late arrival of FY405 caused me to miss the onward domestic connection to Chiang Mai.',
    openedAt: '2026-10-10T11:00:00.000Z',
    resolvedAt: '2026-10-12T18:52:00.000Z',
    closedAt: null,
    updatedAt: '2026-10-12T18:52:00.000Z',
    events: [
      makeEvent('ev-120-1', 'created', 'system', 'System', null, null, false, '2026-10-10T11:00:00.000Z', '10 Oct 11:00', 'System', 'Created by customer (tom.b@example.com)'),
      makeEvent('ev-120-2', 'assigned', 'staff', 'Tong Charoen', 'Mali Rattana', null, false, '2026-10-10T13:15:00.000Z', '10 Oct 13:15', 'Tong Charoen', 'Assigned to Mali Rattana'),
      makeEvent('ev-120-3', 'status_changed', 'staff', 'Mali Rattana', 'resolved', null, false, '2026-10-12T18:52:00.000Z', '12 Oct 18:52', 'Mali Rattana', 'Resolved (Not a duplicate)'),
    ],
  },
  {
    id: 'f13-000116',
    caseNumber: 'CS-2026-000116',
    type: 'employee',
    status: 'closed',
    passengerName: 'David Chen',
    contactEmail: 'david.chen@example.com',
    ownerName: 'Somsak Jaidee',
    location: 'check_in',
    staffName: 'Check-in desk C12',
    flightNumber: 'FY401',
    serviceDate: '2026-10-05',
    issue: 'slow_service',
    summary: 'Priority check-in lane unstaffed for 25 min',
    fromSource: 'Customer',
    age: '6 d',
    unread: false,
    bookingRef: 'T6Y2M8',
    flightRoute: 'FY401 · LHR → BKK · Mon 5 Oct',
    mealDetail: 'Check-in desk C12',
    openedLabel: 'Opened 6 Oct 09:30 by the customer',
    description: 'Gold priority check-in lane at LHR had no agent for 25 minutes while economy queues moved faster.',
    openedAt: '2026-10-06T09:30:00.000Z',
    resolvedAt: '2026-10-07T14:00:00.000Z',
    closedAt: '2026-10-08T10:00:00.000Z',
    updatedAt: '2026-10-08T10:00:00.000Z',
    events: [
      makeEvent('ev-116-1', 'created', 'system', 'System', null, null, false, '2026-10-06T09:30:00.000Z', '6 Oct 09:30', 'System', 'Created by customer (david.chen@example.com)'),
      makeEvent('ev-116-2', 'assigned', 'staff', 'Tong Charoen', 'Somsak Jaidee', null, false, '2026-10-06T11:00:00.000Z', '6 Oct 11:00', 'Tong Charoen', 'Assigned to Somsak Jaidee'),
      makeEvent('ev-116-3', 'status_changed', 'staff', 'Somsak Jaidee', 'resolved', null, false, '2026-10-07T14:00:00.000Z', '7 Oct 14:00', 'Somsak Jaidee', 'Resolved (Not a duplicate)'),
      makeEvent('ev-116-4', 'closed', 'staff', 'Tong Charoen', 'closed', null, false, '2026-10-08T10:00:00.000Z', '8 Oct 10:00', 'Tong Charoen', 'Closed case'),
    ],
  },
]

function getLocalComplaints(): Complaint[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(SEED_STAFF_COMPLAINTS))
      return SEED_STAFF_COMPLAINTS
    }
    return JSON.parse(raw)
  } catch {
    return SEED_STAFF_COMPLAINTS
  }
}

function saveLocalComplaints(data: Complaint[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {}
}

export function useComplaintsApi() {
  const { fetchWithAuth } = useAppAuth()

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    try {
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
    } catch {
      const list = getLocalComplaints()

      if (!path || path === '') {
        return list as unknown as T
      }

      if (path === '/charts') {
        const withSupervisorCount = list.filter((c) => c.status === 'with_supervisor').length
        const assignedCount = list.filter((c) => c.status === 'assigned').length
        const resolvedCount = list.filter((c) => c.status === 'resolved').length
        const closedCount = list.filter((c) => c.status === 'closed').length
        const byType = {
          employee: list.filter((c) => c.type === 'employee').length,
          flight: list.filter((c) => c.type === 'flight').length,
          food: list.filter((c) => c.type === 'food').length,
        }
        const fallbackCharts: StaffChartsResponse = {
          totalComplaints: list.length,
          openNow: withSupervisorCount + assignedCount,
          withSupervisorCount,
          assignedCount,
          resolvedCount,
          closedCount,
          avgDaysToClose: '2.1',
          compensationTotalThb: 6000,
          compensationDecisions: 4,
          compensationFailed: 1,
          byType,
          topFlights: [
            { flight: 'FY405', date: '9 Oct', route: 'SIN → BKK', type: 'Flight', cases: 3 },
            { flight: 'FY308', date: '12 Oct', route: 'BKK → NRT', type: 'Food', cases: 3 },
            { flight: 'FY402', date: '9 Oct', route: 'BKK → CNX', type: 'Food', cases: 2 },
            { flight: 'FY401', date: '5 Oct', route: 'LHR → BKK', type: 'Flight', cases: 2 },
            { flight: 'FY403', date: '7 Oct', route: 'ICN → BKK', type: 'Employee', cases: 1 },
          ],
          weeklyData: [
            { week: '17 Aug', count: 0, latest: false },
            { week: '24 Aug', count: 0, latest: false },
            { week: '31 Aug', count: 0, latest: false },
            { week: '7 Sep', count: 0, latest: false },
            { week: '14 Sep', count: 0, latest: false },
            { week: '21 Sep', count: 0, latest: false },
            { week: '28 Sep', count: 1, latest: false },
            { week: '5 Oct', count: list.length - 1, latest: true },
          ],
        }
        return fallbackCharts as unknown as T
      }

      if (path === '/delivery-log') {
        const rows = list.map((c, idx) => ({
          id: `local-notif-${c.id}`,
          eventId: `ev-local-${idx + 1}`,
          time: '12 Oct 20:15',
          dateLabel: '12 Oct 2026',
          occurredAt: c.openedAt,
          event: 'Complaint received',
          typeCode: 'complaint_received',
          feature: 'Feature 13',
          recipient: c.contactEmail || 'guest@example.com',
          channel: 'Email' as const,
          status: 'Sent' as const,
          linkedTo: c.caseNumber,
          linkedIsCase: true,
          tries: 1,
          subject: `We received your complaint ${c.caseNumber}`,
          body: `Hi ${c.passengerName}, we logged your ${c.type} complaint under ${c.caseNumber}.`,
          error: null,
        }))
        const fallbackDelivery: StaffDeliveryLogResponse = {
          kpis: {
            eventsReceived: rows.length,
            messagesSent: rows.length,
            failedRetrying: 0,
            duplicateIgnored: 1,
          },
          rows,
        }
        return fallbackDelivery as unknown as T
      }

      if (path.includes('/assign') && init?.method === 'PATCH') {
        const id = path.split('/')[1]
        const { ownerName } = JSON.parse(init.body as string) as { ownerName: string }
        const row = list.find((c) => c.id === id)
        if (row) {
          row.ownerName = ownerName
          row.status = 'assigned'
          row.unread = false
          row.updatedAt = new Date().toISOString()
          row.events = row.events ?? []
          row.events.push(
            makeEvent(
              `ev-${Date.now()}`,
              'assigned',
              'staff',
              'Tong Charoen',
              ownerName,
              null,
              false,
              new Date().toISOString(),
              '12 Oct 20:30',
              'Tong Charoen',
              `Assigned to ${ownerName}`,
            ),
          )
          saveLocalComplaints(list)
          return row as unknown as T
        }
      }

      if (path.includes('/status') && init?.method === 'PATCH') {
        const id = path.split('/')[1]
        const { status, resolutionNote } = JSON.parse(init.body as string) as {
          status: CaseStatus
          resolutionNote?: string
        }
        const row = list.find((c) => c.id === id)
        if (row) {
          row.status = status
          row.unread = false
          row.updatedAt = new Date().toISOString()
          if (status === 'resolved') row.resolvedAt = row.updatedAt
          if (status === 'closed') row.closedAt = row.updatedAt
          row.events = row.events ?? []
          const label =
            status === 'resolved'
              ? `Resolved (${resolutionNote || 'Not a duplicate'})`
              : status === 'closed'
                ? 'Closed case'
                : `Status changed to ${status}`
          row.events.push(
            makeEvent(
              `ev-${Date.now()}`,
              'status_changed',
              'staff',
              'Tong Charoen',
              status,
              null,
              false,
              new Date().toISOString(),
              '12 Oct 20:30',
              'Tong Charoen',
              label,
            ),
          )
          saveLocalComplaints(list)
          return row as unknown as T
        }
      }

      if (path.includes('/notes') && init?.method === 'POST') {
        const id = path.split('/')[1]
        const { note } = JSON.parse(init.body as string) as { note: string }
        const row = list.find((c) => c.id === id)
        if (row) {
          row.unread = false
          row.events = row.events ?? []
          row.events.push(
            makeEvent(
              `ev-${Date.now()}`,
              'note_added',
              'staff',
              'Tong Charoen',
              null,
              note,
              true,
              new Date().toISOString(),
              '12 Oct 20:30',
              'Tong Charoen · Internal note',
              note,
            ),
          )
          saveLocalComplaints(list)
          return row as unknown as T
        }
      }

      if (path.includes('/compensation') && init?.method === 'POST') {
        const id = path.split('/')[1]
        const comp = JSON.parse(init.body as string) as CompensationDecision
        const row = list.find((c) => c.id === id)
        if (row) {
          row.unread = false
          row.compensation = comp
          row.events = row.events ?? []
          row.events.push(
            makeEvent(
              `ev-${Date.now()}`,
              'compensation',
              'staff',
              'Tong Charoen',
              `${comp.type} · ${comp.amount}`,
              comp.reason,
              false,
              new Date().toISOString(),
              '12 Oct 20:30',
              'Tong Charoen · Sent to Feature 5B',
              `Compensation decided: ${comp.type} (${comp.amount}) — “${comp.reason}”`,
            ),
          )
          saveLocalComplaints(list)
          return row as unknown as T
        }
      }

      const id = path.replace('/', '')
      const found = list.find((c) => c.id === id)
      if (!found) throw new Error(`Complaint not found`)
      return found as unknown as T
    }
  }

  return {
    list: () => request<Complaint[]>(''),
    get: (id: string) => request<Complaint>(`/${id}`),
    assignOwner: (id: string, ownerName: string) =>
      request<Complaint>(`/${id}/assign`, { method: 'PATCH', body: JSON.stringify({ ownerName }) }),
    setStatus: (id: string, status: CaseStatus, resolutionNote?: string) =>
      request<Complaint>(`/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status, resolutionNote }) }),
    addNote: (id: string, note: string) =>
      request<Complaint>(`/${id}/notes`, { method: 'POST', body: JSON.stringify({ note }) }),
    sendCompensation: (id: string, comp: CompensationDecision) =>
      request<Complaint>(`/${id}/compensation`, { method: 'POST', body: JSON.stringify(comp) }),
    getCharts: () => request<StaffChartsResponse>('/charts'),
    getDeliveryLog: () => request<StaffDeliveryLogResponse>('/delivery-log'),
    getTemplates: () => request<StaffTemplateItemView[]>('/templates'),
    updateTemplate: (code: string, payload: UpdateTemplatePayload) =>
      request<StaffTemplateItemView[]>(`/templates/${code}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
  }
}

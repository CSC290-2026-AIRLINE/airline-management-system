// ponytail: MOCK. Sample records for the screens whose data belongs to other features: the event stream (Person B's event factory),
// the simulated approver (approval flow, no tables yet). Values come from the Figma screens.
// Nothing here is saved or sent anywhere.

export interface MockEvent {
  at: string
  flight: string
  date: string
  event: string
  reason: string // "WX · weather" or ''
  category: string // '' when there is no disruption
  detail: string
  by: string
}

export const MOCK_EVENTS: MockEvent[] = [
  {
    at: 'Thu 1 Oct 07:00',
    flight: 'XX101',
    date: 'Thu 1 Oct',
    event: 'flight.departed',
    reason: '',
    category: '',
    detail: 'departed on the simulation clock',
    by: 'system',
  },
  {
    at: 'Thu 1 Oct 05:40',
    flight: 'XX101',
    date: 'Fri 2 Oct',
    event: 'flight.delayed',
    reason: 'WX · weather',
    category: 'weather',
    detail: '45 min · Thunderstorm cell over the gulf',
    by: 'staff',
  },
  {
    at: 'Wed 30 Sep 09:00',
    flight: 'XX102',
    date: 'Fri 2 Oct',
    event: 'flight.created',
    reason: '',
    category: '',
    detail: 'confirmed',
    by: 'staff',
  },
  {
    at: 'Wed 30 Sep 09:00',
    flight: 'XX102',
    date: 'Thu 1 Oct',
    event: 'flight.created',
    reason: '',
    category: '',
    detail: 'confirmed',
    by: 'staff',
  },
  {
    at: 'Wed 30 Sep 09:00',
    flight: 'XX101',
    date: 'Fri 2 Oct',
    event: 'flight.created',
    reason: '',
    category: '',
    detail: 'confirmed',
    by: 'staff',
  },
  {
    at: 'Wed 30 Sep 09:00',
    flight: 'XX101',
    date: 'Thu 1 Oct',
    event: 'flight.created',
    reason: '',
    category: '',
    detail: 'confirmed',
    by: 'staff',
  },
]

export const DISRUPTION_CATEGORIES = ['weather', 'technical', 'crew', 'air traffic control', 'security', 'airport operations', 'other']

export type ApprovalStatus = 'Approved' | 'Other times offered' | 'Pending' | 'Rejected'

export interface MockApproval {
  id: string
  flight: string
  date: string
  purpose: 'New flight' | 'Reschedule'
  proposed: string
  aircraft: string
  status: ApprovalStatus
  approver: string // "BKK · revision 1"
  answer: string
  action: string // the button on the row
}

export const MOCK_APPROVALS: MockApproval[] = [
  {
    id: 'a1',
    flight: 'XX101',
    date: 'Sun 4 Oct',
    purpose: 'New flight',
    proposed: '07:00',
    aircraft: 'HS-AB1',
    status: 'Approved',
    approver: 'BKK · revision 1',
    answer: 'Approved at once (auto mode). Confirm it on Generate flights.',
    action: 'Confirm',
  },
  {
    id: 'a2',
    flight: 'XX102',
    date: 'Sun 4 Oct',
    purpose: 'New flight',
    proposed: '09:30',
    aircraft: 'HS-AB1',
    status: 'Other times offered',
    approver: 'CNX · revision 1',
    answer: 'Slots 10:00, 10:30, 11:00',
    action: 'Pick a slot',
  },
  {
    id: 'a3',
    flight: 'XX101',
    date: 'Tue 6 Oct',
    purpose: 'New flight',
    proposed: '07:00',
    aircraft: 'HS-AB3',
    status: 'Pending',
    approver: 'BKK · revision 1',
    answer: 'Waiting on the Approver console (manual mode).',
    action: 'Open console',
  },
  {
    id: 'a4',
    flight: 'XX102',
    date: 'Tue 6 Oct',
    purpose: 'New flight',
    proposed: '09:30',
    aircraft: 'HS-AB3',
    status: 'Rejected',
    approver: 'CNX · revision 1',
    answer: 'capacity_full: CNX has no departure left that hour.',
    action: 'Revise',
  },
  {
    id: 'a5',
    flight: 'XX102',
    date: 'Fri 2 Oct',
    purpose: 'Reschedule',
    proposed: '10:00',
    aircraft: 'HS-AB1',
    status: 'Other times offered',
    approver: 'CNX · revision 1',
    answer: 'Window 10:15–11:30',
    action: 'Pick a time',
  },
]

export interface MockRequest {
  id: string
  requested: string
  flight: string
  date: string
  purpose: string
  proposed: string
  aircraft: string
  approver: string
}

export const MOCK_REQUESTS: MockRequest[] = [
  {
    id: 'r1',
    requested: 'Thu 1 Oct 07:20',
    flight: 'XX101',
    date: 'Tue 6 Oct',
    purpose: 'New flight',
    proposed: '07:00 → 08:15',
    aircraft: 'HS-AB3',
    approver: 'BKK slot coordinator',
  },
  {
    id: 'r2',
    requested: 'Thu 1 Oct 07:26',
    flight: 'XX102',
    date: 'Wed 7 Oct',
    purpose: 'New flight',
    proposed: '09:30 → 10:45',
    aircraft: 'HS-AB3',
    approver: 'CNX slot coordinator',
  },
]

export interface MockPolicy {
  airport: string
  curfewFrom: string // '' when there is no curfew
  curfewTo: string
  maxPerHour: number
  offers: 'A list of slots' | 'A time window'
}

export const MOCK_POLICIES: MockPolicy[] = [
  { airport: 'BKK', curfewFrom: '00:00', curfewTo: '05:00', maxPerHour: 20, offers: 'A list of slots' },
  { airport: 'CNX', curfewFrom: '23:00', curfewTo: '06:00', maxPerHour: 8, offers: 'A time window' },
  { airport: 'HKT', curfewFrom: '', curfewTo: '', maxPerHour: 12, offers: 'A list of slots' },
]

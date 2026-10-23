// ponytail: MOCK. Stand-ins for other teams' work, so the screens that depend on it can be built now.
//   F1  simulation clock          -> MOCK_CLOCK
//   F9  aircraft list             -> MOCK_AIRCRAFT
//   Person B change-aircraft and delay endpoints, conflicts -> mockChangeAircraft, mockApplyDelay, MOCK_OPEN_CONFLICTS
//   partner airlines per route (the schema has partner_airline but no link to a route) -> mockPartners
// Values come from the Figma file. Nothing here reads or writes the database, and nothing is saved.
// When the real endpoint exists, replace the body of the matching function here and nothing else changes.
import { clockOf } from '../format'
import type { FlightRow } from '../types'

export const MOCK_CLOCK = 'Thu 1 Oct 2026 07:30'
export const MOCK_OPEN_CONFLICTS = 1

export const MOCK_AIRCRAFT = [
  { id: 'HS-AB1', label: 'HS-AB1 · A320 · in service', usable: true },
  { id: 'HS-AB2', label: 'HS-AB2 · A320 · in maintenance', usable: false },
  { id: 'HS-AB3', label: 'HS-AB3 · A320 · in service', usable: true },
]

export interface BatchItem {
  flight: FlightRow
  ok: boolean
  detail: string
}

const pause = () => new Promise((resolve) => setTimeout(resolve, 300))

// Flights are handled in departure order and each is checked on its own, so one failure never blocks the others.
const inDepartureOrder = (flights: FlightRow[]) => [...flights].sort((a, b) => a.dep_at.localeCompare(b.dep_at))

function lateReason(f: FlightRow) {
  if (f.status === 'departed') return 'Flight has already departed.'
  if (f.status === 'arrived') return 'Flight has already arrived.'
  if (f.status === 'cancelled') return 'A cancelled flight cannot be changed.'
  return null
}

export async function mockChangeAircraft(flights: FlightRow[], aircraftId: string): Promise<BatchItem[]> {
  await pause()
  const aircraft = MOCK_AIRCRAFT.find((a) => a.id === aircraftId)
  return inDepartureOrder(flights).map((flight) => {
    const late = lateReason(flight)
    if (late) return { flight, ok: false, detail: late }
    if (!aircraft?.usable) return { flight, ok: false, detail: `${aircraftId} is not in service.` }
    return { flight, ok: true, detail: `${aircraftId} assigned.` }
  })
}

export async function mockApplyDelay(flights: FlightRow[], minutes: number): Promise<BatchItem[]> {
  await pause()
  return inDepartureOrder(flights).map((flight) => {
    const late = lateReason(flight)
    return late ? { flight, ok: false, detail: late } : { flight, ok: true, detail: `Delayed ${minutes} min.` }
  })
}

// Partner airlines that can carry a route. Figma shows these two routes; any other route has none.
const PARTNERS: Record<string, string[]> = {
  'BKK-CNX': ['Partner Air (PA)'],
  'CNX-BKK': ['Partner Air (PA)', 'Skyline Connect (SC)'],
}
export const mockPartners = (origin: string, destination: string) => PARTNERS[`${origin}-${destination}`] ?? []

// ponytail: MOCK. Flight detail actions that belong to Person B, F9 and the approval flow.
export interface MockResult {
  ok: boolean
  detail: string
}

export async function mockCancelFlight(flight: FlightRow, reason: string, resolution: string): Promise<MockResult> {
  await pause()
  const late = lateReason(flight)
  if (late) return { ok: false, detail: late }
  return { ok: true, detail: `Cancelled (${reason}, ${resolution}).` }
}

export interface MockCheck {
  label: string
  text: string
}

// The four read-only checks run before a reschedule is requested. All pass in the demo.
export async function mockCheckReschedule(tail: string, distanceKm: number): Promise<MockCheck[]> {
  await pause()
  return [
    MOCK_AIRCRAFT.find((a) => a.id === tail)?.usable === false
      ? { label: 'Failed', text: `Aircraft: ${tail} is in maintenance until Tue 6 Oct 23:59 (feature 9). Change the aircraft first.` }
      : { label: 'Passed', text: `Aircraft: ${tail} is in service for the whole flight (feature 9).` },
    { label: 'Passed', text: `Range: ${distanceKm} km is within the maximum range of the aircraft type (feature 9).` },
    { label: 'Passed', text: "Position and turnaround: the aircraft's previous flight ends in time for this departure (feature 9)." },
    { label: 'Passed', text: 'Congestion: no congestion window overlaps this departure.' },
  ]
}

// Demo cost figures: the hourly rate, ground time and seat numbers are the Figma sample values, not data from F9, F3b or F4. Airport fees are real.
export const MOCK_COST = {
  operatingPerHour: 95000,
  groundHours: 0.75,
  seats: 40,
  seatPrice: 2500,
}

// ponytail: MOCK. One open conflict, as in the Figma Conflicts screens; Person B's conflict checks will supply the real list.
export interface MockConflict {
  id: string
  kind: 'Cascade'
  flight: string
  date: string
  text: string
  detected: string
  departs: string // HH:MM local, the flight's current departure
  blockMin: number
  impact: { bookings: number; crew: number; bags: number; cargo: number }
}

export const MOCK_CONFLICTS: MockConflict[] = [
  {
    id: 'conflict-1',
    kind: 'Cascade',
    flight: 'XX102',
    date: 'Fri 2 Oct',
    text: 'Turnaround short by 15 min at CNX before XX102: XX101 arrives Fri 2 Oct 09:00 and the minimum is 45 min, set by the A320 aircraft type.',
    detected: 'Thu 1 Oct 05:40',
    departs: '09:30',
    blockMin: 75,
    impact: { bookings: 158, crew: 6, bags: 126, cargo: 0 },
  },
]

// Later departures that clear a turnaround conflict, in 15 minute steps, with the arrival each one gives.
export function mockSlots(departs: string, blockMin: number) {
  const [h, m] = departs.split(':').map(Number)
  return [30, 45, 60, 75].map((extra) => ({
    extra,
    depart: clockOf(h * 60 + m + extra),
    arrive: clockOf(h * 60 + m + extra + blockMin),
  }))
}

// ponytail: MOCK. The steps between "preview" and "confirm" on Generate flights belong to F9 (aircraft), Person B (gates) and the approval flow.
export type Approval = 'none' | 'not_requested' | 'pending' | 'approved' | 'offered' | 'rejected'

export interface GateResult {
  passed: boolean
  text: string
}

export async function mockCheckGates(aircraftId: string): Promise<GateResult> {
  await pause()
  const a = MOCK_AIRCRAFT.find((x) => x.id === aircraftId)
  if (a?.usable) return { passed: true, text: 'Gates passed' }
  return { passed: false, text: `${aircraftId} is in maintenance until Tue 6 Oct 23:59 (feature 9).` }
}

export interface ApprovalAnswer {
  approval: Approval
  text: string
}

// The simulated approver answers in turn: approved, other times offered, pending, rejected. The real one answers by airport policy or by hand.
export async function mockRequestApproval(origins: string[]): Promise<ApprovalAnswer[]> {
  await pause()
  const cycle = ['approved', 'offered', 'pending', 'rejected'] as const
  return origins.map((origin, i) => {
    const approval = cycle[i % cycle.length]
    const text = {
      approved: `${origin} slot coordinator · revision 1`,
      offered: 'Slots 10:00, 10:30, 11:00',
      pending: 'Waiting on the Approver console (manual mode).',
      rejected: `capacity_full · ${origin} has no departure left that hour.`,
    }[approval]
    return { approval, text }
  })
}

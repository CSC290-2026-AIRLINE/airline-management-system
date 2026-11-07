import type { BagColour, BagType, FoundBagStatus, MatchLevel, MatchReason, MatchStatus, ReportStatus } from '../constants'
import { useBaggageSend } from './found-bags'

export interface StaffName {
  id: string
  firstName: string
  lastName: string
}

/** Same shape as the backend's `BagMatch` (`apps/backend/src/modules/baggage/common/bag-match.types.ts`), dates as ISO strings. */
export interface BagMatch {
  id: string
  level: MatchLevel
  status: MatchStatus
  score: number
  reasons: MatchReason[]
  linkedBy: StaffName | null
  reviewedBy: StaffName | null
  reviewNote: string | null
  suggestedAt: string
  reviewedAt: string | null
  createdAt: string
  updatedAt: string
  report: {
    id: string
    caseNumber: string
    status: ReportStatus
    passengerFirstName: string
    passengerLastName: string
    bookingReference: string
    flightId: string
    flightNumber: string
    flightDate: string
    tagNumber: string | null
    bagType: BagType
    colour: BagColour
    brand: string | null
    description: string | null
    reportedAt: string
    reportedByStaff: boolean
  }
  foundBag: {
    id: string
    status: FoundBagStatus
    tagNumber: string | null
    flightId: string | null
    flightNumber: string | null
    bagType: BagType | null
    colour: BagColour | null
    brand: string | null
    description: string | null
    foundAirport: string
    foundAt: string
    currentAirport: string
  }
}

/** `/api/staff/bag-matches`. Same rule as `useFoundBagApi`: never list these functions as effect dependencies. */
export function useBagMatchApi() {
  const send = useBaggageSend()

  return {
    list: () => send<BagMatch[]>('/api/staff/bag-matches'),
    link: (reportId: string, foundBagId: string) =>
      send<BagMatch>('/api/staff/bag-matches', { method: 'POST', body: JSON.stringify({ reportId, foundBagId }) }),
    confirm: (id: string, note: string) =>
      send<BagMatch>(`/api/staff/bag-matches/${id}/confirm`, { method: 'POST', body: JSON.stringify({ note }) }),
    reject: (id: string, note?: string) =>
      send<BagMatch>(`/api/staff/bag-matches/${id}/reject`, { method: 'POST', body: JSON.stringify(note ? { note } : {}) }),
  }
}

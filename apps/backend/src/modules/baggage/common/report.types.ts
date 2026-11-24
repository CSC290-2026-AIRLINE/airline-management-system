import type { BagType, BagColour, ReportStatus } from './baggage.constants'

export interface LostBagReport {
  id: string
  caseNumber: string

  bookingPassengerId: string
  passengerId: string
  flightId: string

  reportedByCustomerId: string | null
  reportedByStaffId: string | null

  tagNumber: string | null
  bagType: BagType
  colour: BagColour
  brand: string | null
  description: string | null
  photoUrl: string | null

  contactEmail: string | null
  contactPhone: string | null

  status: ReportStatus

  reportedAt: Date
  lostAt: Date | null
  closedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

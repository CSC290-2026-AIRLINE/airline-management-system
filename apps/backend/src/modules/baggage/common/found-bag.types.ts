import type { BagType, BagColour } from './baggage.constants'

/**
 * Found-bag statuses and sources follow the reviewed F10 schema (25 Oct).
 */
export const FOUND_BAG_STATUSES = ['held', 'matched', 'sent', 'delivered', 'unclaimed', 'continued_with_flight'] as const

export type FoundBagStatus = (typeof FOUND_BAG_STATUSES)[number]

export const FOUND_BAG_SOURCES = ['staff', 'diverted_flight'] as const

export type FoundBagSource = (typeof FOUND_BAG_SOURCES)[number]

export interface FoundBag {
  id: string

  checkedBagId: string | null
  tagNumber: string | null
  flightId: string | null

  // Diverted-flight rows get their type and colour later, when staff check the bag.
  bagType: BagType | null
  colour: BagColour | null
  brand: string | null
  description: string | null

  foundAirport: string
  foundAt: Date

  source: FoundBagSource
  status: FoundBagStatus
  recordedBy: string | null

  createdAt: Date
  updatedAt: Date
}

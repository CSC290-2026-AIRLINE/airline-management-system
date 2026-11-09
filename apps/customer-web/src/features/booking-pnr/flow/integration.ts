import type { ComponentType } from 'react'
import type { SearchItinerary } from '../../booking-search/pages/FlightSearchPage'
import type { AssistanceFieldsProps, PriceChangedDialogProps, SeatTakenDialogProps } from '../components/contracts'
import type { PriceChangedDetails } from '../api/types'
import type { TravellerDraft } from './draft'

export interface SeatChoice {
  travellerKey: string
  flightId: string
  seatCode: string
}

// A owns navigation and draft state; C supplies the actual seat UI.
export interface BookingSeatStepProps {
  itinerary: SearchItinerary
  travellers: TravellerDraft[]
  choices: SeatChoice[]
  busy: boolean
  error: string | null
  onChange: (choices: SeatChoice[]) => void
  onBack: () => void
  onContinue: () => void
  onSkip: () => void
}

export interface FlowComponents {
  AssistanceFields?: ComponentType<AssistanceFieldsProps>
  SeatStep?: ComponentType<BookingSeatStepProps>
  PriceChangedDialog?: ComponentType<PriceChangedDialogProps>
  SeatTakenDialog?: ComponentType<SeatTakenDialogProps>
}

export function priceChangedDetails(value: unknown): PriceChangedDetails | null {
  if (!value || typeof value !== 'object') return null
  const details = value as Partial<PriceChangedDetails>
  if (
    typeof details.previousTotal !== 'number' ||
    !Number.isFinite(details.previousTotal) ||
    details.previousTotal < 0 ||
    typeof details.newTotal !== 'number' ||
    !Number.isFinite(details.newTotal) ||
    details.newTotal < 0 ||
    details.currency !== 'USD'
  )
    return null
  return details as PriceChangedDetails
}

export function validateSeatChoices(choices: SeatChoice[], travellers: TravellerDraft[], itinerary: SearchItinerary): void {
  const passengers = new Set<string>(),
    seats = new Set<string>()
  for (const choice of choices) {
    if (
      !travellers.some((person) => person.key === choice.travellerKey && person.expectedType !== 'infant') ||
      !itinerary.selections.some((selection) => selection.flight.flightId === choice.flightId) ||
      !/^[1-9][0-9]?[A-Z]$/.test(choice.seatCode)
    )
      throw new Error('Check the selected passengers, flights and seats.')
    const passenger = `${choice.flightId}/${choice.travellerKey}`,
      seat = `${choice.flightId}/${choice.seatCode}`
    if (passengers.has(passenger) || seats.has(seat)) throw new Error('Choose one different seat per passenger on each flight.')
    passengers.add(passenger)
    seats.add(seat)
  }
}

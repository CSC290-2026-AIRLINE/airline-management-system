export type Cabin = 'economy' | 'premium_economy' | 'business' | 'first'
export type TripType = 'one_way' | 'return' | 'multi_city'

export interface FlightSearchLeg {
  origin: string
  destination: string
  date: string
}

export interface FlightSearchRequest {
  tripType: TripType
  legs: FlightSearchLeg[]
  adults: number
  children: number
  infants: number
  cabin?: Cabin
}

// One fare of one flight. The ids go into POST /bookings (HoldBookingSegment) unchanged.
export interface CabinAvailability {
  cabin: Cabin
  fareClassId: string
  // For display, for example "Y".
  fareClassCode: string
  // Feature 4's quote; null when Feature 4 refused the option (see unavailableReason).
  fareQuoteId: string | null
  // Price per passenger (D2); the trip total is pricePerPassenger x (adults + children).
  pricePerPassenger: number
  currency: string
  // Show "9+" above 9.
  seatsLeft: number
  // Set when Feature 4 rejects the option (for example an advance-purchase window): show it as unavailable.
  unavailableReason: string | null
  milesPrice?: number | null
}

export interface FlightOption {
  flightId: string
  flightNumber: string
  origin: string
  destination: string
  depAt: string
  arrAt: string
  durationMinutes: number
  cabins: CabinAvailability[]
}

export interface FlightSearchLegResult {
  leg: FlightSearchLeg
  options: FlightOption[]
}

export interface FlightSearchResponse {
  legs: FlightSearchLegResult[]
}

export interface ApiErrorBody {
  error: {
    code: string
    message: string
    details?: unknown
  }
}

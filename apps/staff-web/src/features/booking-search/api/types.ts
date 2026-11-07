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

export interface CabinAvailability {
  cabin: string
  fareClassCode: string
  price: number
  currency: string
  seatsLeft: number
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

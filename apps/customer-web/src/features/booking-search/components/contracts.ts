import type { Cabin, FlightSearchLeg, TripType } from '../api/types'

export interface FlightSearchFormValue {
  tripType: TripType
  legs: FlightSearchLeg[]
  adults: number
  children: number
  infants: number
  cabin: Cabin
}

export interface FlightSearchFormProps {
  value: FlightSearchFormValue
  onChange: (value: FlightSearchFormValue) => void
  onSubmit: (value: FlightSearchFormValue) => void
  isLoading?: boolean
  errorMessage?: string | null
  /** Leaves out the passenger counts (one adult), for a compact search box. The search page shows them. */
  hidePassengers?: boolean
}

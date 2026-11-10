import type { flight, passenger, route } from '@backend/db/generated/prisma/client'
import { BookingError } from '../common/booking-error'
import type { PassengerType } from '../contracts'
import type { HoldBookingDto } from './dto/hold-booking.dto'

export type HoldFlight = flight & { route: route }
export const invalidHold = (message: string): never => {
  throw new BookingError('INVALID_BOOKING_STATE', message, 422)
}

export function ageOn(birth: Date, date: Date): number {
  let age = date.getUTCFullYear() - birth.getUTCFullYear()
  if (date.getUTCMonth() < birth.getUTCMonth() || (date.getUTCMonth() === birth.getUTCMonth() && date.getUTCDate() < birth.getUTCDate()))
    age--
  return age
}

export function validateHoldFlights(request: HoldBookingDto, flights: HoldFlight[], now: Date): HoldFlight[] {
  const ids = request.segments.map((segment) => segment.flightId)
  if (new Set(ids).size !== ids.length) invalidHold('A flight may appear only once in the booking')
  const ordered = ids.map((id) => {
    const flight = flights.find((row) => row.id === id)
    if (!flight || !['scheduled', 'delayed'].includes(flight.status) || flight.dep_at.getTime() < now.getTime() + 3600000) {
      throw new BookingError('FLIGHT_NOT_FOR_SALE', 'A selected flight is not for sale')
    }
    return flight
  })
  if (request.tripType === 'one_way' && ordered.length !== 1) invalidHold('One-way booking requires one segment')
  if (request.tripType === 'return') {
    if (ordered.length !== 2) invalidHold('Return booking requires two segments')
    const [outbound, inbound] = ordered
    if (
      inbound.route.origin !== outbound.route.destination ||
      inbound.route.destination !== outbound.route.origin ||
      inbound.service_date < outbound.service_date
    )
      invalidHold('Invalid return itinerary')
  }
  if (request.tripType === 'multi_city') {
    if (ordered.length < 2 || ordered.length > 5) invalidHold('Multi-city booking requires two to five segments')
    for (let index = 1; index < ordered.length; index++) {
      if (ordered[index].dep_at.getTime() < ordered[index - 1].scheduled_arr_at.getTime() + 3600000) {
        invalidHold('Multi-city segments require at least 60 minutes after the previous scheduled arrival')
      }
    }
  }
  return ordered
}

export function validateHoldPassengers(request: HoldBookingDto, rows: passenger[], flights: HoldFlight[]): Map<string, PassengerType> {
  if (new Set(request.passengers.map((person) => person.passengerId)).size !== request.passengers.length) invalidHold('Duplicate passenger')
  const types = new Map<string, PassengerType>()
  const firstDate = flights[0].service_date
  const lastDate = flights[flights.length - 1].service_date
  for (const person of request.passengers) {
    const row = rows.find((candidate) => candidate.id === person.passengerId)
    if (!row?.date_of_birth) invalidHold('Every passenger must exist and have a date of birth')
    const birth = row!.date_of_birth!
    const age = ageOn(birth, firstDate)
    if (age < 0) invalidHold('Passenger date of birth is after departure')
    const type: PassengerType = age < 2 ? 'infant' : age < 12 ? 'child' : 'adult'
    if (type === 'infant' && ageOn(birth, lastDate) >= 2) invalidHold('A lap infant must remain under two for every segment')
    types.set(person.passengerId, type)
  }
  const adults = [...types.values()].filter((type) => type === 'adult').length
  const infants = [...types.values()].filter((type) => type === 'infant').length
  const seats = types.size - infants
  if (seats < 1 || seats > 9 || infants > adults) invalidHold('Invalid passenger party')
  const laps = new Set<string>()
  for (const person of request.passengers) {
    if (types.get(person.passengerId) === 'infant') {
      const adult = person.lapOfPassengerId
      if (!adult || types.get(adult) !== 'adult' || laps.has(adult)) invalidHold('Each infant needs a different adult on the booking')
      laps.add(adult!)
    } else if (person.lapOfPassengerId) invalidHold('Only infants may travel on a lap')
  }
  const seatChoices = new Set<string>()
  for (const seat of request.seats ?? []) {
    const key = `${seat.passengerId}/${seat.flightId}`
    if (
      !types.has(seat.passengerId) ||
      !request.segments.some((segment) => segment.flightId === seat.flightId) ||
      types.get(seat.passengerId) === 'infant' ||
      seatChoices.has(key)
    )
      invalidHold('Invalid passenger or flight in seat choice')
    seatChoices.add(key)
  }
  for (const service of request.serviceRequests ?? []) {
    if (
      !types.has(service.passengerId) ||
      (service.flightId && !request.segments.some((segment) => segment.flightId === service.flightId))
    ) {
      invalidHold('Invalid passenger or flight in assistance request')
    }
  }
  return types
}

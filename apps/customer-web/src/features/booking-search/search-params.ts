import type { Cabin, FlightSearchLeg, TripType } from './api/types'
import type { FlightSearchFormValue } from './components/contracts'
import { validateSearch } from './components/search-validation'

/**
 * The flight search page keeps its state in the URL, so a refresh (or a shared link) comes back to the same search.
 *
 * The URL is flat on purpose: TanStack Router serialises arrays as one JSON string, so the legs and the picked fares
 * travel as numbered keys — `leg1=BKK,CNX,2026-11-20` and `pick1=<flightId>,<fareClassId>`. Every value is validated
 * on the way in, so a hand-edited or stale link falls back to the defaults instead of breaking the page.
 */

export type FlightSearchSort = 'price' | 'departure' | 'duration'

/** One picked fare, kept by id so it can be matched back to a search result. */
export interface FlightSearchPick {
  flightId: string
  fareClassId: string
}

/** Everything about the search page that lives in the URL. */
export interface FlightSearchUrlState {
  form: FlightSearchFormValue
  /** True when a search was run, so the results are fetched again on load. */
  submitted: boolean
  sort: FlightSearchSort
  /** One entry per leg; `undefined` where no fare is picked yet. */
  picks: Array<FlightSearchPick | undefined>
}

/** The URL shape. Every field is optional so plain links to `/search` stay valid. */
export interface FlightSearchParams {
  trip?: TripType
  leg1?: string
  leg2?: string
  leg3?: string
  leg4?: string
  leg5?: string
  adults?: number
  children?: number
  infants?: number
  cabin?: Cabin
  submitted?: 1
  sort?: FlightSearchSort
  pick1?: string
  pick2?: string
  pick3?: string
  pick4?: string
  pick5?: string
}

const LEG_KEYS = ['leg1', 'leg2', 'leg3', 'leg4', 'leg5'] as const
const PICK_KEYS = ['pick1', 'pick2', 'pick3', 'pick4', 'pick5'] as const
const AIRPORT = /^[A-Z]{3}$/
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const CABINS: Cabin[] = ['economy', 'premium_economy', 'business', 'first']
const SORTS: FlightSearchSort[] = ['price', 'departure', 'duration']
const TRIP_TYPES: TripType[] = ['one_way', 'return', 'multi_city']

export function defaultFlightSearchValue(): FlightSearchFormValue {
  return {
    tripType: 'one_way',
    legs: [{ origin: '', destination: '', date: '' }],
    adults: 1,
    children: 0,
    infants: 0,
    cabin: 'economy',
  }
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value.trim() : undefined
}

function readCount(value: unknown): number | undefined {
  const count =
    typeof value === 'number' ? value : typeof value === 'string' && /^\d{1,2}$/.test(value.trim()) ? Number(value.trim()) : Number.NaN
  if (!Number.isInteger(count) || count < 0 || count > 9) return undefined
  return count
}

function isCalendarDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

/** `BKK,CNX,2026-11-20` — one leg. Empty parts are allowed: the form holds a half-filled leg while the user types. */
function parseLeg(raw: string): FlightSearchLeg | undefined {
  const parts = raw.split(',')
  if (parts.length > 3) return undefined
  const origin = (parts[0] ?? '').trim().toUpperCase()
  const destination = (parts[1] ?? '').trim().toUpperCase()
  const date = (parts[2] ?? '').trim()
  if (origin && !AIRPORT.test(origin)) return undefined
  if (destination && !AIRPORT.test(destination)) return undefined
  if (date && !isCalendarDate(date)) return undefined
  return { origin, destination, date }
}

function legToParam(leg: FlightSearchLeg): string {
  return `${leg.origin},${leg.destination},${leg.date}`
}

function parsePick(raw: string | undefined): FlightSearchPick | undefined {
  if (!raw) return undefined
  const parts = raw.split(',')
  if (parts.length !== 2) return undefined
  const flightId = (parts[0] ?? '').trim()
  const fareClassId = (parts[1] ?? '').trim()
  if (!flightId || !fareClassId) return undefined
  return { flightId, fareClassId }
}

/** Reads the raw query string into the normalised URL shape. Anything unusable is dropped. */
export function parseFlightSearchParams(raw: Record<string, unknown>): FlightSearchParams {
  const params: FlightSearchParams = {}
  const trip = readString(raw.trip)
  if (trip && TRIP_TYPES.includes(trip as TripType)) params.trip = trip as TripType
  for (const key of LEG_KEYS) {
    const value = readString(raw[key])
    if (value === undefined) break
    const leg = parseLeg(value)
    if (!leg) break
    params[key] = legToParam(leg)
  }
  const adults = readCount(raw.adults)
  if (adults !== undefined) params.adults = adults
  const children = readCount(raw.children)
  if (children !== undefined) params.children = children
  const infants = readCount(raw.infants)
  if (infants !== undefined) params.infants = infants
  const cabin = readString(raw.cabin)
  if (cabin && CABINS.includes(cabin as Cabin)) params.cabin = cabin as Cabin
  if (raw.submitted === 1 || raw.submitted === '1' || raw.submitted === true) params.submitted = 1
  const sort = readString(raw.sort)
  if (sort && SORTS.includes(sort as FlightSearchSort)) params.sort = sort as FlightSearchSort
  for (const key of PICK_KEYS) {
    const pick = parsePick(readString(raw[key]))
    if (pick) params[key] = `${pick.flightId},${pick.fareClassId}`
  }
  return params
}

function legsFromParams(params: FlightSearchParams): FlightSearchLeg[] {
  const legs: FlightSearchLeg[] = []
  for (const key of LEG_KEYS) {
    const value = params[key]
    if (value === undefined) break
    const leg = parseLeg(value)
    if (!leg) break
    legs.push(leg)
  }
  return legs
}

/** The legs the given trip type shows: one for a one-way, two for a return, the rest for multi-city. */
function legsForTrip(tripType: TripType, legs: FlightSearchLeg[]): FlightSearchLeg[] {
  if (tripType === 'one_way') return [legs[0] ?? { origin: '', destination: '', date: '' }]
  if (tripType === 'return')
    return [legs[0] ?? { origin: '', destination: '', date: '' }, legs[1] ?? { origin: '', destination: '', date: '' }]
  return legs.length ? legs : [{ origin: '', destination: '', date: '' }]
}

function inferTrip(legs: FlightSearchLeg[]): TripType {
  if (legs.length <= 1) return 'one_way'
  if (legs.length === 2) return 'return'
  return 'multi_city'
}

/** A form the API would accept: the leg count matches the trip type and the shared validation passes. */
function isRunnable(form: FlightSearchFormValue): boolean {
  const legs = form.legs.length
  if (form.tripType === 'one_way' && legs !== 1) return false
  if (form.tripType === 'return' && legs !== 2) return false
  if (form.tripType === 'multi_city' && legs < 2) return false
  return validateSearch(form) === null
}

/** Turns the URL into the state the page works with, with the defaults filled in. */
export function flightSearchStateFromParams(params: FlightSearchParams): FlightSearchUrlState {
  const legs = legsFromParams(params)
  const tripType = params.trip ?? inferTrip(legs)
  const form: FlightSearchFormValue = {
    tripType,
    legs: legsForTrip(tripType, legs),
    adults: params.adults ?? 1,
    children: params.children ?? 0,
    infants: params.infants ?? 0,
    cabin: params.cabin ?? 'economy',
  }
  const submitted = params.submitted === 1 && isRunnable(form)
  const picks: Array<FlightSearchPick | undefined> = form.legs.map((_, index) => {
    const key = PICK_KEYS[index]
    if (!key || !submitted) return undefined
    return parsePick(params[key])
  })
  return { form, submitted, sort: params.sort ?? 'price', picks }
}

/** Turns the page state back into the URL. Defaults are left out to keep the link short. */
export function flightSearchParamsFromState(state: FlightSearchUrlState): FlightSearchParams {
  const params: FlightSearchParams = {}
  params.trip = state.form.tripType
  state.form.legs.forEach((leg, index) => {
    const key = LEG_KEYS[index]
    if (!key) return
    const empty = !leg.origin && !leg.destination && !leg.date
    if (empty && state.form.legs.length === 1) return
    params[key] = legToParam(leg)
  })
  if (state.form.adults !== 1) params.adults = state.form.adults
  if (state.form.children !== 0) params.children = state.form.children
  if (state.form.infants !== 0) params.infants = state.form.infants
  if (state.form.cabin !== 'economy') params.cabin = state.form.cabin
  if (state.submitted) params.submitted = 1
  if (state.sort !== 'price') params.sort = state.sort
  state.picks.forEach((pick, index) => {
    const key = PICK_KEYS[index]
    if (!key || !pick) return
    params[key] = `${pick.flightId},${pick.fareClassId}`
  })
  return params
}

/** A stable key for a state, used to tell our own navigation apart from a Back or Forward. */
export function flightSearchStateKey(state: FlightSearchUrlState): string {
  return JSON.stringify(flightSearchParamsFromState(state))
}

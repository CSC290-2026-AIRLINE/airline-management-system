import type { BuildPairingParams, ScheduledFlight } from './types'

/**
 * Placeholder flight data for the build-pairings page.
 *
 * This is the only module that fakes data. When the backend lands, replace
 * `loadFlights` with a TanStack Query call and leave every other module alone:
 * the types already match an API payload and no component imports this file.
 *
 * All instants are UTC ISO-8601 and the roster is read in Asia/Bangkok, so
 * `12:30` local below is stored as `05:30Z`.
 */
export const MOCK_FLIGHTS: readonly ScheduledFlight[] = [
  {
    id: 'FL-210',
    flightNumber: 'FD210',
    origin: 'BKK',
    destination: 'NRT',
    departureAt: '2026-09-15T05:30:00.000Z',
    arrivalAt: '2026-09-15T11:30:00.000Z',
    status: 'available',
  },
  {
    id: 'FL-211',
    flightNumber: 'FD211',
    origin: 'NRT',
    destination: 'BKK',
    departureAt: '2026-09-15T12:30:00.000Z',
    arrivalAt: '2026-09-15T16:30:00.000Z',
    status: 'available',
  },
  {
    id: 'FL-511',
    flightNumber: 'FD511',
    origin: 'BKK',
    destination: 'ICN',
    departureAt: '2026-09-16T00:30:00.000Z',
    arrivalAt: '2026-09-16T05:45:00.000Z',
    status: 'available',
  },
  {
    id: 'FL-512',
    flightNumber: 'FD512',
    origin: 'ICN',
    destination: 'BKK',
    departureAt: '2026-09-17T06:45:00.000Z',
    arrivalAt: '2026-09-17T11:30:00.000Z',
    status: 'available',
  },
  {
    id: 'FL-620',
    flightNumber: 'FD620',
    origin: 'BKK',
    destination: 'SIN',
    departureAt: '2026-09-17T01:00:00.000Z',
    arrivalAt: '2026-09-17T04:20:00.000Z',
    status: 'available',
  },
  {
    id: 'FL-621',
    flightNumber: 'FD621',
    origin: 'SIN',
    destination: 'KUL',
    departureAt: '2026-09-17T05:30:00.000Z',
    arrivalAt: '2026-09-17T06:30:00.000Z',
    status: 'available',
  },
  {
    id: 'FL-622',
    flightNumber: 'FD622',
    origin: 'KUL',
    destination: 'BKK',
    departureAt: '2026-09-17T08:00:00.000Z',
    arrivalAt: '2026-09-17T10:10:00.000Z',
    // Deliberately excluded from the auto-build pool. This is the flight an
    // operator adds by hand to close P-103, which is what turns it from
    // `BKK ➔ SIN ➔ KUL` (Invalid) into `BKK ➔ SIN ➔ KUL ➔ BKK` (Valid).
    status: 'manually_added',
  },
  {
    id: 'FL-814',
    flightNumber: 'FD814',
    origin: 'BKK',
    destination: 'CNX',
    departureAt: '2026-09-17T23:10:00.000Z',
    arrivalAt: '2026-09-18T01:00:00.000Z',
    status: 'available',
  },
  {
    id: 'FL-815',
    flightNumber: 'FD815',
    origin: 'CNX',
    destination: 'BKK',
    departureAt: '2026-09-18T12:00:00.000Z',
    arrivalAt: '2026-09-18T13:20:00.000Z',
    status: 'available',
  },
]

/** Bases an operator can build pairings from. Mirrors the `base` lookup endpoint. */
export const MOCK_BASES: readonly string[] = ['BKK', 'DMK', 'HKT', 'CNX']

/** The roster run shell around the page: header badge, stepper and simulation clock. */
export const MOCK_ROSTER_RUN = {
  id: 'RUN-2026-09-15-BKK',
  base: 'BKK',
  dateFrom: '2026-09-15',
  dateTo: '2026-09-19',
  status: 'Draft',
} as const

/** Simulation clock shown in the sidebar footer. */
export const MOCK_SIMULATION_CLOCK = 'Mon 14 Sep 2026 · 09:00' as const

export const DEFAULT_PARAMS: BuildPairingParams = {
  dateFrom: MOCK_ROSTER_RUN.dateFrom,
  dateTo: MOCK_ROSTER_RUN.dateTo,
  base: MOCK_ROSTER_RUN.base,
}

/**
 * Stand-in for the flight-scheduling fetch. Returns flights that depart inside
 * the requested window so the empty and filtered states stay reachable.
 */
export function loadFlights(params: BuildPairingParams): Promise<ScheduledFlight[]> {
  const from = `${params.dateFrom}T00:00:00.000+07:00`
  const to = `${params.dateTo}T23:59:59.999+07:00`
  const fromMs = new Date(from).getTime()
  const toMs = new Date(to).getTime()
  const matching = MOCK_FLIGHTS.filter((flight) => {
    const departure = new Date(flight.departureAt).getTime()
    return departure >= fromMs && departure <= toMs
  })
  return Promise.resolve([...matching])
}

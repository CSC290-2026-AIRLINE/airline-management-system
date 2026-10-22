/**
 * Placeholder crew and committed-pairing data for the assign-crew page.
 *
 * The roster-run shell and the flights are imported from Build pairings rather
 * than copied, so the two wizard steps can never disagree about a flight time.
 * Everything a real backend would own lives here: the crew list, which pairings
 * were handed over, and which were left out.
 */
import { MOCK_FLIGHTS, MOCK_ROSTER_RUN, MOCK_SIMULATION_CLOCK } from '../../build-pairings/types/mock-data'
import type { AirportCode, CommittedLeg, CommittedPairing, CrewMember, ExcludedPairing, IsoInstant, LocalDate } from './types'

export { MOCK_ROSTER_RUN, MOCK_SIMULATION_CLOCK }

/** Bases an operator can crew from. Same list Build pairings offers. */
export const MOCK_BASES: readonly string[] = ['BKK', 'DMK', 'HKT', 'CNX']

/** Aircraft type every leg in this roster run needs a rating for. */
export const ROSTER_AIRCRAFT_TYPE = 'A320'

/** Airport country lookup, used to decide whether a leg is international. */
export const AIRPORT_COUNTRIES: Readonly<Record<AirportCode, string>> = {
  BKK: 'TH',
  DMK: 'TH',
  HKT: 'TH',
  CNX: 'TH',
  NRT: 'JP',
  ICN: 'KR',
  SIN: 'SG',
  KUL: 'MY',
}

/** Language a crew member must speak to count as local crew on a leg into that airport. */
export const DESTINATION_LANGUAGES: Readonly<Record<AirportCode, { code: string; label: string }>> = {
  BKK: { code: 'th', label: 'Thai' },
  DMK: { code: 'th', label: 'Thai' },
  HKT: { code: 'th', label: 'Thai' },
  CNX: { code: 'th', label: 'Thai' },
  NRT: { code: 'ja', label: 'Japanese' },
  ICN: { code: 'ko', label: 'Korean' },
  SIN: { code: 'en', label: 'English' },
  KUL: { code: 'ms', label: 'Malay' },
}

/** City names, used in the "no crew who speak Korean" sentence. */
export const AIRPORT_CITIES: Readonly<Record<AirportCode, string>> = {
  BKK: 'Bangkok',
  DMK: 'Bangkok',
  HKT: 'Phuket',
  CNX: 'Chiang Mai',
  NRT: 'Tokyo',
  ICN: 'Seoul',
  SIN: 'Singapore',
  KUL: 'Kuala Lumpur',
}

/**
 * Cabin crew needed per leg, per the fleet rule quoted in the "Rules used" card.
 * That rule belongs to Feature 9; it is duplicated here only so the mock can show
 * "4 of 4" and so the police rule has a complement to count against.
 */
export const CABIN_CREW_PER_LEG = 4

/** Police required on an international leg. */
export const POLICE_PER_INTERNATIONAL_LEG = 2

function range(start: IsoInstant, end: IsoInstant) {
  return [{ start, end }]
}

/**
 * The crew on duty for this roster run.
 *
 * The cabin and police pools share names because the design mockups do; the real
 * crew table would keep those roles disjoint, so a name appearing twice is a mock
 * artefact rather than a modelling decision.
 */
export const MOCK_CREW: readonly CrewMember[] = [
  {
    id: 'CREW-01',
    name: 'S. Kittipong',
    role: 'captain',
    nationality: 'TH',
    languages: ['th', 'en'],
    typeRatings: [ROSTER_AIRCRAFT_TYPE],
    // The only A320-rated captain on duty for this run, so they cover every leg.
    // That is what produces the minimum-rest break the mockups show.
    unavailableRanges: [],
  },
  {
    id: 'CREW-02',
    name: 'N. Chaiyo',
    role: 'first_officer',
    nationality: 'TH',
    languages: ['th', 'en'],
    typeRatings: [ROSTER_AIRCRAFT_TYPE],
    unavailableRanges: [],
  },
  {
    id: 'CREW-03',
    name: 'L. Tan',
    role: 'first_officer',
    nationality: 'SG',
    languages: ['en'],
    typeRatings: [ROSTER_AIRCRAFT_TYPE],
    unavailableRanges: [],
  },
  { id: 'CREW-04', name: 'C. Boonma', role: 'cabin', nationality: 'TH', languages: ['th', 'en'], typeRatings: [], unavailableRanges: [] },
  { id: 'CREW-05', name: 'W. Rattana', role: 'cabin', nationality: 'TH', languages: ['th', 'en'], typeRatings: [], unavailableRanges: [] },
  { id: 'CREW-06', name: 'M. Sutthida', role: 'cabin', nationality: 'TH', languages: ['th', 'en'], typeRatings: [], unavailableRanges: [] },
  { id: 'CREW-07', name: 'K. Prasert', role: 'cabin', nationality: 'TH', languages: ['th', 'en'], typeRatings: [], unavailableRanges: [] },
  // Second cabin team. Four cabin crew for four pairings would put the same four
  // people on every leg of the run, so each pairing rest-break would fire once per
  // person; a base that flies two pairings in a window runs two teams.
  {
    id: 'CREW-13',
    name: 'P. Wattanakul',
    role: 'cabin',
    nationality: 'TH',
    languages: ['th', 'en'],
    typeRatings: [],
    unavailableRanges: [],
  },
  {
    id: 'CREW-14',
    name: 'A. Charoenkul',
    role: 'cabin',
    nationality: 'TH',
    languages: ['th', 'en'],
    typeRatings: [],
    unavailableRanges: [],
  },
  { id: 'CREW-15', name: 'T. Ngamsom', role: 'cabin', nationality: 'TH', languages: ['th', 'en'], typeRatings: [], unavailableRanges: [] },
  {
    id: 'CREW-16',
    name: 'S. Ratanakul',
    role: 'cabin',
    nationality: 'TH',
    languages: ['th', 'en'],
    typeRatings: [],
    unavailableRanges: [],
  },
  {
    id: 'CREW-08',
    name: 'Y. Sato',
    role: 'local',
    nationality: 'JP',
    // Speaks Japanese and Thai, which is why they cover both the Tokyo leg and the
    // leg back into Bangkok.
    languages: ['ja', 'th', 'en'],
    typeRatings: [],
    unavailableRanges: [],
  },
  { id: 'CREW-09', name: 'P. Saetang', role: 'local', nationality: 'TH', languages: ['th', 'en'], typeRatings: [], unavailableRanges: [] },
  { id: 'CREW-10', name: 'C. Boonma', role: 'police', nationality: 'TH', languages: ['th', 'en'], typeRatings: [], unavailableRanges: [] },
  {
    id: 'CREW-11',
    name: 'W. Rattana',
    role: 'police',
    nationality: 'TH',
    languages: ['th', 'en'],
    typeRatings: [],
    // On a day shift until 18:00 on 15 Sep, and the roster only carries two police,
    // so FD210 has nobody to backfill and stays one short. That is the POLICE_MIN break.
    unavailableRanges: range('2026-09-15T01:00:00.000Z', '2026-09-15T11:00:00.000Z'),
  },
]

function legFromFlightId(flightId: string): CommittedLeg {
  const flight = MOCK_FLIGHTS.find((candidate) => candidate.id === flightId)
  if (!flight) throw new Error(`Mock roster run has no flight ${flightId}`)
  return {
    flightId: flight.id,
    flightNumber: flight.flightNumber,
    origin: flight.origin,
    destination: flight.destination,
    departureAt: flight.departureAt,
    arrivalAt: flight.arrivalAt,
  }
}

/**
 * The valid pairings Build pairings handed over. Both start selected, which is the
 * state the mockups open on.
 */
export const MOCK_COMMITTED_PAIRINGS: readonly CommittedPairing[] = [
  { id: 'P-101', base: MOCK_ROSTER_RUN.base, legs: [legFromFlightId('FL-210'), legFromFlightId('FL-211')] },
  { id: 'P-102', base: MOCK_ROSTER_RUN.base, legs: [legFromFlightId('FL-511'), legFromFlightId('FL-512')] },
]

/** Pairings Build pairings refused to hand over. The footnote under the picker is built from this. */
export const MOCK_EXCLUDED_PAIRINGS: readonly ExcludedPairing[] = [
  { id: 'P-103', reason: 'invalid' },
  { id: 'P-104', reason: 'invalid' },
]

export const DEFAULT_PARAMS = {
  dateFrom: MOCK_ROSTER_RUN.dateFrom as LocalDate,
  dateTo: MOCK_ROSTER_RUN.dateTo as LocalDate,
  base: MOCK_ROSTER_RUN.base as AirportCode,
}

/**
 * Stand-in for the committed-pairings fetch. Filters by the chosen window so the
 * empty state stays reachable, exactly as `loadFlights` does for Build pairings.
 */
export function loadCommittedPairings(params: { dateFrom: LocalDate; dateTo: LocalDate }): Promise<CommittedPairing[]> {
  return Promise.resolve(
    MOCK_COMMITTED_PAIRINGS.filter((pairing) => {
      const firstLeg = pairing.legs[0]
      if (!firstLeg) return false
      return firstLeg.departureAt.slice(0, 10) >= params.dateFrom && firstLeg.departureAt.slice(0, 10) <= params.dateTo
    }),
  )
}

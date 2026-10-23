import { useCallback, useMemo, useState } from 'react'
import { DEFAULT_PARAMS, MOCK_BASES, loadFlights } from './mock-data'
import { generatePairings, validatePairing } from './pairing-engine'
import type { BuildPairingParams, FlightLeg, LocalDate, Pairing, PairingMetrics, ScheduledFlight } from './types'

/** Transient page-level feedback, rendered as a banner or a toast. */
export interface PageNotice {
  tone: 'success' | 'warning'
  message: string
}

export type LoadState = 'idle' | 'loading' | 'error'

export interface BuildPairingsState {
  params: BuildPairingParams
  bases: readonly string[]
  flights: ScheduledFlight[]
  pairings: Pairing[]
  selectedId: string | null
  loadState: LoadState
  notice: PageNotice | null
  /** `Date to must be on or after Date from.` when the range is inverted. */
  dateError: string | null
  hasGenerated: boolean
  metrics: PairingMetrics
  setDateFrom: (value: string) => void
  setDateTo: (value: string) => void
  setBase: (value: string) => void
  generate: () => void
  clearPairings: () => void
  select: (id: string | null) => void
  saveLegs: (id: string, legs: FlightLeg[]) => void
  deletePairing: (id: string) => void
  dismissNotice: () => void
}

/**
 * All build-pairings state in one place.
 *
 * This hook is the only module that knows data is mocked. `loadFlights` is the
 * single async call; swapping it for TanStack Query later means changing this
 * file only, because every component reads plain values from here.
 *
 * Note: pairing validity is never stored. `evaluations` recomputes it from the
 * legs on every render, so a status badge and its check list can never disagree.
 */
export function useBuildPairings(): BuildPairingsState {
  const [params, setParams] = useState<BuildPairingParams>(DEFAULT_PARAMS)
  const [flights, setFlights] = useState<ScheduledFlight[]>([])
  const [pairings, setPairings] = useState<Pairing[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loadState, setLoadState] = useState<LoadState>('idle')
  const [notice, setNotice] = useState<PageNotice | null>(null)
  const [hasGenerated, setHasGenerated] = useState(false)

  const dateError = isRangeInverted(params) ? 'Date to must be on or after Date from.' : null

  const generate = useCallback(() => {
    if (isRangeInverted(params)) return
    setLoadState('loading')
    setNotice(null)
    setSelectedId(null)
    loadFlights(params)
      .then((loaded) => {
        setFlights(loaded)
        setPairings(generatePairings(loaded, params.base))
        setHasGenerated(true)
        setLoadState('idle')
      })
      .catch(() => {
        setLoadState('error')
      })
  }, [params])

  const clearPairings = useCallback(() => {
    setPairings([])
    setSelectedId(null)
    setHasGenerated(false)
    setNotice(null)
    setLoadState('idle')
  }, [])

  const saveLegs = useCallback(
    (id: string, legs: FlightLeg[]) => {
      setPairings((current) => current.map((pairing) => (pairing.id === id ? { ...pairing, legs } : pairing)))
      setNotice({ tone: 'success', message: `${id} saved · re-checked: ${describeOutcome(legs, params.base)}` })
    },
    [params.base],
  )

  const deletePairing = useCallback(
    (id: string) => {
      const target = pairings.find((pairing) => pairing.id === id)
      // The modal blocks this first; the guard keeps the rule true if the action
      // is ever triggered another way.
      if (!target || target.published) return
      const flightNumbers = target.legs.map((leg) => leg.flightNumber)
      setPairings((current) =>
        current.map((pairing) =>
          pairing.id === id
            ? {
                ...pairing,
                legs: [],
                deleted: true,
                releasedFlightIds: target.legs.map((leg) => leg.flightId),
                releasedFlightNumbers: flightNumbers,
              }
            : pairing,
        ),
      )
      setSelectedId(null)
      setNotice({
        tone: 'warning',
        message: `${id} deleted · ${flightNumbers.join(' and ')} ${flightNumbers.length === 1 ? 'is' : 'are'} back in the unpaired list. Generate pairings again to rebuild ${flightNumbers.length === 1 ? 'it' : 'them'}.`,
      })
    },
    [pairings],
  )

  const metrics = useMemo<PairingMetrics>(() => {
    let validCount = 0
    let invalidCount = 0
    let deletedCount = 0
    let totalFlights = 0

    for (const pairing of pairings) {
      if (pairing.deleted) {
        deletedCount += 1
        continue
      }
      totalFlights += pairing.legs.length
      if (validatePairing(pairing).status === 'passed') validCount += 1
      else invalidCount += 1
    }

    return { totalPairings: pairings.length, totalFlights, validCount, invalidCount, deletedCount }
  }, [pairings])

  return {
    params,
    bases: MOCK_BASES,
    flights,
    pairings,
    selectedId,
    loadState,
    notice,
    dateError,
    hasGenerated,
    metrics,
    setDateFrom: (value) => setParams((current) => ({ ...current, dateFrom: value as LocalDate })),
    setDateTo: (value) => setParams((current) => ({ ...current, dateTo: value as LocalDate })),
    setBase: (value) => setParams((current) => ({ ...current, base: value })),
    generate,
    clearPairings,
    select: setSelectedId,
    saveLegs,
    deletePairing,
    dismissNotice: () => setNotice(null),
  }
}

function isRangeInverted(params: BuildPairingParams): boolean {
  return params.dateFrom !== '' && params.dateTo !== '' && params.dateTo < params.dateFrom
}

function describeOutcome(legs: readonly FlightLeg[], base: string): string {
  const draft: Pairing = {
    id: 'draft',
    base,
    legs: [...legs],
    deleted: false,
    releasedFlightIds: [],
    releasedFlightNumbers: [],
    published: false,
  }
  const evaluation = validatePairing(draft)
  return evaluation.status === 'passed'
    ? `Valid (${describeDays(legs)}, max ${evaluation.checks[2]?.value} duty a day)`
    : `Invalid (${evaluation.primaryError?.detail ?? 'does not meet pairing rules'})`
}

function describeDays(legs: readonly FlightLeg[]): string {
  const days = new Set(legs.map((leg) => leg.departureAt.slice(0, 10)))
  const count = days.size
  return `${count} ${count === 1 ? 'day' : 'days'}`
}

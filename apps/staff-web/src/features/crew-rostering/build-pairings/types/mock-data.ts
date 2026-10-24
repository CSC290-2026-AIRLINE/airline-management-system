import type { BuildPairingParams } from './types'

/**
 * What the crew-rostering pages still fake.
 *
 * Everything the pages show about crew, rules, flights, pairings and runs comes from
 * `/api/crew-rostering`. Two things do not belong to Feature 8 and stay stand-ins until
 * the feature that owns them lands: the simulation clock, and the window a page opens on
 * when the URL does not carry one.
 */

/** The window and base the wizard pages open on. The operator changes both from the page. */
export const MOCK_ROSTER_RUN = {
  base: 'BKK',
  dateFrom: '2026-09-15',
  dateTo: '2026-09-19',
} as const

/** Simulation clock shown in the sidebar footer. Owned by the simulation feature. */
export const MOCK_SIMULATION_CLOCK = 'Mon 14 Sep 2026 · 09:00' as const

/** Trimmed clock for the mobile top bar, where the full stamp does not fit. */
export const MOCK_SIMULATION_CLOCK_SHORT = 'Sim · 14 Sep 09:00' as const

export const DEFAULT_PARAMS: BuildPairingParams = {
  dateFrom: MOCK_ROSTER_RUN.dateFrom,
  dateTo: MOCK_ROSTER_RUN.dateTo,
  base: MOCK_ROSTER_RUN.base,
}

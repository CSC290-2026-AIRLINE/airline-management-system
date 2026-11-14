import type { BuildPairingParams } from './types'

/**
 * What the crew-rostering pages still fake.
 *
 * Everything the pages show about crew, rules, flights, pairings and runs comes from
 * `/api/crew-rostering`, except the window a page opens on when the URL does not carry one.
 */

/** The window and base the wizard pages open on. The operator changes both from the page. */
export const MOCK_ROSTER_RUN = {
  base: 'BKK',
  dateFrom: '2026-09-15',
  dateTo: '2026-09-19',
} as const

export const DEFAULT_PARAMS: BuildPairingParams = {
  dateFrom: MOCK_ROSTER_RUN.dateFrom,
  dateTo: MOCK_ROSTER_RUN.dateTo,
  base: MOCK_ROSTER_RUN.base,
}

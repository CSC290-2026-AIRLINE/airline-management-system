import { MOCK_ROSTER_RUN, MOCK_SIMULATION_CLOCK } from '../../build-pairings/types/mock-data'
import type { AirportCode, LocalDate } from './types'

export { MOCK_SIMULATION_CLOCK }

/**
 * The window the wizard pages open on when the URL does not carry one. Everything else
 * on these pages comes from `/api/crew-rostering`; this is only where they start.
 */
export const DEFAULT_PARAMS = {
  dateFrom: MOCK_ROSTER_RUN.dateFrom as LocalDate,
  dateTo: MOCK_ROSTER_RUN.dateTo as LocalDate,
  base: MOCK_ROSTER_RUN.base as AirportCode,
}

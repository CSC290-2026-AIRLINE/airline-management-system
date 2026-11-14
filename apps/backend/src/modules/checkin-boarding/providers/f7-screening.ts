import { Injectable } from '@nestjs/common'
import { ScreeningCheckService } from '@backend/modules/screening/screening-check.service'
import type { ScreeningProvider } from './providers'

/** The caller source feature 7 records on the screening run and its audit rows. */
const SOURCE = 'checkin_boarding'

/**
 * Feature 7's watchlist screening, run at the passport step. Feature 7 reads the passenger and the flight itself, so
 * only their ids are passed. It can also answer `denied` (a confirmed match); feature 6 holds that passenger like any
 * other hit, so nobody it refuses is ever cleared here. When screening cannot run, feature 7 fails closed: the
 * answer is `held` with no run id.
 */
@Injectable()
export class F7Screening implements ScreeningProvider {
  constructor(private readonly screening: ScreeningCheckService) {}

  async check(input: { passengerId: string; flightId: string }): Promise<{ runId: string | null; outcome: 'clear' | 'held' }> {
    const result = await this.screening.checkSystem(SOURCE, {
      passengerId: input.passengerId,
      flightId: input.flightId,
      triggerPoint: 'check_in',
    })
    const runId = 'runId' in result ? result.runId : null
    return { runId, outcome: result.outcome === 'clear' ? 'clear' : 'held' }
  }
}

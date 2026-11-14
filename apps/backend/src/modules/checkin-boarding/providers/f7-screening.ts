import { randomUUID } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import { ScreeningCheckService } from '@backend/modules/screening/screening-check.service'
import type { ScreeningProvider } from './providers'

/** The caller source feature 7 records on the screening run and its audit rows. */
const SOURCE = 'checkin_boarding'

/**
 * Feature 7's watchlist screening, run at the passport step. Feature 7 reads the passenger and the flight itself, so
 * only their ids are passed. It can also answer `denied` (a confirmed match); feature 6 holds that passenger like any
 * other hit, so nobody it refuses is ever cleared here. When screening cannot run, feature 7 fails closed: the
 * answer is `held` with no run id, and feature 7 audits it as `screening_skipped`. The check-in table refuses an
 * on-hold row without a run id, so a fresh one is given here; it points at no screening run.
 */
@Injectable()
export class F7Screening implements ScreeningProvider {
  constructor(private readonly screening: ScreeningCheckService) {}

  async check(input: { passengerId: string; flightId: string }): Promise<{ runId: string; outcome: 'clear' | 'held' }> {
    const result = await this.screening.checkSystem(SOURCE, {
      passengerId: input.passengerId,
      flightId: input.flightId,
      triggerPoint: 'check_in',
    })
    const runId = 'runId' in result ? result.runId : randomUUID()
    return { runId, outcome: result.outcome === 'clear' ? 'clear' : 'held' }
  }

  async status(input: { passengerId: string; flightId: string }): Promise<'clear' | 'held' | 'denied' | 'not_screened'> {
    return (await this.screening.statusSystem(SOURCE, input.passengerId, input.flightId)).outcome
  }
}

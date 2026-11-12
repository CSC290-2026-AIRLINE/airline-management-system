import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common'
import { FoundBagLifecycleService } from './found-bag-lifecycle.service'

/** How often held bags are checked. The cut-off follows the simulation clock, so a shifted clock is picked up here. */
export const UNCLAIMED_SWEEP_INTERVAL_MS = 60_000

/**
 * Marks held bags unclaimed once they pass baggage_setting.unclaimed_after_days, so nobody has to press a button.
 * Same pattern as LostReportTimeoutRunner on feat-10-lost-baggage-report. Each sweep is one guarded update, so two
 * backend instances sweeping at once mark each bag only once.
 */
@Injectable()
export class FoundBagUnclaimedRunner implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FoundBagUnclaimedRunner.name)
  private interval: ReturnType<typeof setInterval> | undefined
  private running = false

  constructor(private readonly lifecycle: FoundBagLifecycleService) {}

  onModuleInit(): void {
    void this.sweep()
    this.interval = setInterval(() => void this.sweep(), UNCLAIMED_SWEEP_INTERVAL_MS)
  }

  onModuleDestroy(): void {
    if (this.interval) clearInterval(this.interval)
  }

  async sweep(): Promise<void> {
    if (this.running) return
    this.running = true

    try {
      const result = await this.lifecycle.markUnclaimed()
      if (result.marked > 0) {
        this.logger.log(`Marked ${result.marked} held bag(s) unclaimed (cut-off ${result.cutoff.toISOString()})`)
      }
    } catch (error) {
      this.logger.error('Unclaimed bag sweep failed', error instanceof Error ? error.stack : String(error))
    } finally {
      this.running = false
    }
  }
}

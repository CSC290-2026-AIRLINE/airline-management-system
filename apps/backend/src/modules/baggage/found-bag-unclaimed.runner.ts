import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common'
import { FoundBagLifecycleService } from './found-bag-lifecycle.service'

const SWEEP_INTERVAL_MS = 60_000

/** Runs the unclaimed_after_days rule as the system, the same way LostReportTimeoutRunner runs lost_after_days. */
@Injectable()
export class FoundBagUnclaimedRunner implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FoundBagUnclaimedRunner.name)
  private interval: ReturnType<typeof setInterval> | undefined
  private running = false

  constructor(private readonly lifecycle: FoundBagLifecycleService) {}

  onModuleInit(): void {
    void this.sweep()
    this.interval = setInterval(() => void this.sweep(), SWEEP_INTERVAL_MS)
  }

  onModuleDestroy(): void {
    if (this.interval) clearInterval(this.interval)
  }

  private async sweep(): Promise<void> {
    if (this.running) return
    this.running = true

    try {
      // No actor: markUnclaimed audits the change as the system.
      const result = await this.lifecycle.markUnclaimed()
      if (result.marked > 0) {
        this.logger.log(`Marked ${result.marked} found bag(s) unclaimed (found on or before ${result.cutoff.toISOString()})`)
      }
    } catch (error) {
      this.logger.error('Found-bag unclaimed sweep failed', error instanceof Error ? error.stack : String(error))
    } finally {
      this.running = false
    }
  }
}

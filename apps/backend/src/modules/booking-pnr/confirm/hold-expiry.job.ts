import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common'
import { ReleaseService } from './release.service'

const SWEEP_INTERVAL_MS = 60_000

/** B2: every minute on the simulation clock, release the held bookings whose hold has run out. */
@Injectable()
export class HoldExpiryJob implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HoldExpiryJob.name)
  private timer?: NodeJS.Timeout

  constructor(private readonly release: ReleaseService) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      this.release.releaseStale().catch((error: unknown) => {
        this.logger.error('Hold expiry sweep failed', error instanceof Error ? error : undefined)
      })
    }, SWEEP_INTERVAL_MS)
    // Never keep the process (or a Jest context) alive just for the interval.
    this.timer.unref()
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = undefined
    }
  }
}

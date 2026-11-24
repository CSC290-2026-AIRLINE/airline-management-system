import { ConflictException, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common'
import { BiEtlService } from './bi-etl.service'

/** How often the BI copy is rebuilt from the source tables while the backend runs. */
export const BI_AUTO_REFRESH_INTERVAL_MS = 15_000

/**
 * Rebuilds the `bi_*` copy from the source tables every 15 seconds. A plain interval, like the nightly refresh. A tick
 * that finds a run still in progress is skipped, and a failed run is already recorded on its `bi_etl_run` row, so
 * neither is thrown.
 */
@Injectable()
export class BiAutoRefresh implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BiAutoRefresh.name)
  private timer: NodeJS.Timeout | null = null

  constructor(private readonly etl: BiEtlService) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.run(), BI_AUTO_REFRESH_INTERVAL_MS)
    // The interval alone must not keep the process (or a test run) alive.
    this.timer.unref()
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  /** One automatic refresh. Never throws. */
  async run(): Promise<void> {
    try {
      await this.etl.refresh('scheduled', null)
    } catch (error) {
      if (error instanceof ConflictException) return
      this.logger.error(`Automatic BI refresh failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}

import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common'
import { LostReportLifecycleService } from './lost-report-lifecycle.service'

const SWEEP_INTERVAL_MS = 60_000

@Injectable()
export class LostReportTimeoutRunner implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LostReportTimeoutRunner.name)
  private interval: ReturnType<typeof setInterval> | undefined
  private running = false

  constructor(private readonly lifecycle: LostReportLifecycleService) {}

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
      const result = await this.lifecycle.markTimedOutReports()
      if (result.marked > 0) {
        this.logger.log(`Marked ${result.marked} lost baggage report(s) lost at simulation time ${result.evaluatedAt.toISOString()}`)
      }
    } catch (error) {
      this.logger.error('Lost-report timeout sweep failed', error instanceof Error ? error.stack : String(error))
    } finally {
      this.running = false
    }
  }
}

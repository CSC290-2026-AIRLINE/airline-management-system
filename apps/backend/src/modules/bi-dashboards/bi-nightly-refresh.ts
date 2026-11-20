import { ConflictException, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common'
import { BiEtlService } from './bi-etl.service'

/**
 * The nightly run's hour in UTC: 19:00 UTC is 02:00 in Bangkok (UTC+7, no daylight saving), when nobody is reading the
 * dashboards. UTC on purpose, because the backend image sets no time zone and server-local time would differ between a
 * laptop and the deployed container.
 */
export const NIGHTLY_HOUR_UTC = 19

/** Milliseconds from `now` to the next `hour`:00 UTC; tomorrow's if that hour has passed today. */
export function msUntilNextRun(now: Date, hour = NIGHTLY_HOUR_UTC): number {
  const next = new Date(now)
  next.setUTCHours(hour, 0, 0, 0)
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1)
  return next.getTime() - now.getTime()
}

/**
 * Runs the scheduled BI refresh every night, beside the manual Refresh button. A plain timer rather than a scheduling
 * package: one job, one instance. A night that finds a run in progress is skipped, and a failed run is already recorded
 * on its `bi_etl_run` row, so neither is thrown.
 */
@Injectable()
export class BiNightlyRefresh implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BiNightlyRefresh.name)
  private timer: NodeJS.Timeout | null = null

  constructor(private readonly etl: BiEtlService) {}

  onModuleInit(): void {
    this.schedule()
  }

  onModuleDestroy(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  /** One scheduled refresh. Never throws. */
  async run(): Promise<void> {
    try {
      const run = await this.etl.refresh('scheduled', null)
      this.logger.log(`Nightly BI refresh ${run.id} finished`)
    } catch (error) {
      if (error instanceof ConflictException) {
        this.logger.warn('Nightly BI refresh skipped: RUN_IN_PROGRESS')
        return
      }
      this.logger.error(`Nightly BI refresh failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private schedule(): void {
    this.timer = setTimeout(() => void this.runAndReschedule(), msUntilNextRun(new Date()))
    // The timer alone must not keep the process (or a test run) alive.
    this.timer.unref()
  }

  private async runAndReschedule(): Promise<void> {
    await this.run()
    // Stopped while the run was going: don't start another night.
    if (this.timer) this.schedule()
  }
}

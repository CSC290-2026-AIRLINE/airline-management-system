import { Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { SimulationClock } from '@backend/modules/admin-console/simulation-clock'
import { utcDateKey } from './domain/dates'
import { LoyaltyError } from './loyalty-error'
import { LoyaltyJobsService, type JobName } from './loyalty-jobs.service'

/** How often (real time) the scheduler looks at the simulation clock. */
export const SCHEDULER_TICK_MS = 60_000

/**
 * Runs the loyalty jobs on the simulation clock, with no extra package: a real-time timer ticks every minute and
 *
 *   - runs `earn` on every tick (it sweeps arrived flights, so a missed tick costs nothing),
 *   - runs `return-to-cash` then `upgrade` once per simulated hour, the first tick after the simulated UTC hour
 *     changes, and
 *   - runs `tier` then `expire` once per simulated day, the first tick after the simulated UTC date changes.
 *
 * Shifting the simulation clock forward an hour or a day therefore triggers those jobs on the next tick. Off under
 * NODE_ENV=test so tests never touch a database. A job already running (a staff run) is skipped, not queued.
 */
@Injectable()
export class LoyaltyJobScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(LoyaltyJobScheduler.name)
  private timer: NodeJS.Timeout | null = null
  private lastDailyRun: string | null = null
  private lastHourlyRun: string | null = null
  private ticking = false

  constructor(
    private readonly jobs: LoyaltyJobsService,
    private readonly clock: SimulationClock,
    private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.get<string>('NODE_ENV') === 'test') return
    this.timer = setInterval(() => void this.tick(), SCHEDULER_TICK_MS)
    this.timer.unref()
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  /** One scheduler step; public so it can be tested without timers. */
  async tick(): Promise<void> {
    if (this.ticking) return
    this.ticking = true
    try {
      await this.runQuietly('earn')
      const now = this.clock.now()
      const hour = now.toISOString().slice(0, 13)
      if (this.lastHourlyRun !== hour) {
        await this.runQuietly('return-to-cash')
        await this.runQuietly('upgrade')
        this.lastHourlyRun = hour
      }
      const today = utcDateKey(now)
      if (this.lastDailyRun !== today) {
        await this.runQuietly('tier')
        await this.runQuietly('expire')
        this.lastDailyRun = today
      }
    } finally {
      this.ticking = false
    }
  }

  private async runQuietly(name: JobName): Promise<void> {
    try {
      await this.jobs.run(name)
    } catch (error) {
      if (error instanceof LoyaltyError && error.code === 'JOB_RUNNING') return
      this.logger.error(`Scheduled ${name} job failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}

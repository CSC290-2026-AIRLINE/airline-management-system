import { Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common'
import { CrewPayService } from './crew-pay.service'

const JOB_INTERVAL_MS = 60_000

/**
 * Prices pairings whose last leg has arrived into payroll lines, on a plain interval (no scheduler package is
 * installed). The step is idempotent, so two backend instances only repeat each other's work. Off under NODE_ENV=test.
 */
@Injectable()
export class CrewPayJobService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(CrewPayJobService.name)
  private timer: NodeJS.Timeout | null = null
  private running = false

  constructor(private readonly crewPay: CrewPayService) {}

  onApplicationBootstrap() {
    if (process.env.NODE_ENV === 'test') return
    // Startup catch-up first, then every minute.
    setTimeout(() => void this.runOnce(), 5_000)
    this.timer = setInterval(() => void this.runOnce(), JOB_INTERVAL_MS)
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer)
  }

  async runOnce(): Promise<void> {
    if (this.running) return
    this.running = true
    try {
      const count = await this.crewPay.pricePendingPairings()
      if (count > 0) this.logger.log(`crew pay pricing: ${count}`)
    } catch (error) {
      this.logger.error(`crew pay pricing failed: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      this.running = false
    }
  }
}

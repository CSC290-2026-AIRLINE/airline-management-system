import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { CargoOperationsService } from './cargo-operations.service'

const TICK_MS = 30_000

/** Runs the cargo jobs on a short interval (hold expiry, flight changes, departure and arrival). Off under Jest. */
@Injectable()
export class CargoJobsRunner implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('CargoJobs')
  private timer?: ReturnType<typeof setInterval>
  private running = false

  constructor(private readonly ops: CargoOperationsService) {}

  onModuleInit() {
    if (process.env.JEST_WORKER_ID) return
    void this.run()
    this.timer = setInterval(() => void this.run(), TICK_MS)
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer)
  }

  private async run() {
    if (this.running) return
    this.running = true
    try {
      await this.ops.tick()
    } catch (e) {
      this.logger.warn(`Cargo job pass failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      this.running = false
    }
  }
}

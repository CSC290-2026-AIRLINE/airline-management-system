import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { TurnaroundService } from './turnaround.service'

const TICK_MS = 60_000

/** Starts the turnaround of every landed flight on a short interval of the simulation clock. Off under Jest. */
@Injectable()
export class TurnaroundJob implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('TurnaroundJob')
  private timer?: ReturnType<typeof setInterval>
  private running = false

  constructor(private readonly turnarounds: TurnaroundService) {}

  onModuleInit() {
    if (process.env.JEST_WORKER_ID) return
    void this.run()
    this.timer = setInterval(() => void this.run(), TICK_MS)
    // The timer must not keep the process alive on its own.
    this.timer.unref?.()
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer)
  }

  /** One pass; a pass that is still running makes the next one skip instead of queueing. */
  async run(): Promise<void> {
    if (this.running) return
    this.running = true
    try {
      const started = await this.turnarounds.startForLandedFlights()
      if (started > 0) this.logger.log(`Started ${started} turnaround(s) for landed flights`)
    } catch (e) {
      this.logger.warn(`Turnaround job pass failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      this.running = false
    }
  }
}

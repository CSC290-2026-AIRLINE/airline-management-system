// SchedulerService: the F12 scheduled job.
//
// Every tick it does three things:
//   1. generates the catering order of every flight whose cutoff has
//      passed (the cutoff is the scheduled departure minus the
//      shortest cabin order window), and refreshes the orders it
//      generated before, so the quantities stay in step with the
//      stock;
//   2. expires the customer orders that were not paid in time and
//      gives their reserved stock back;
//   3. writes off the batches that expired.
//
// The job calls the same generate logic as the staff endpoint does;
// it does not go through HTTP.

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { DbService } from '../../../db/db.service'
import { SystemClock } from '../common/clock'
import { CateringOrdersService } from '../catering-orders/catering-orders.service'
import { ProductOrdersService } from '../product-orders/product-orders.service'
import { StockBatchesService } from '../stock-batches/stock-batches.service'

// How many flights one tick looks at. A tick never blocks the next
// one, so a slow tick is skipped rather than queued.
const MAX_FLIGHTS_PER_TICK = 200

@Injectable()
export class SchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SchedulerService.name)
  private timer: ReturnType<typeof setInterval> | null = null
  private running = false

  constructor(
    private readonly db: DbService,
    private readonly clock: SystemClock,
    private readonly cateringOrders: CateringOrdersService,
    private readonly productOrders: ProductOrdersService,
    private readonly stockBatches: StockBatchesService,
  ) {}

  onModuleInit(): void {
    if (!this.enabled()) {
      this.logger.log('The F12 scheduler is disabled (F12_SCHEDULER_ENABLED).')
      return
    }
    const intervalMs = this.intervalMs()
    this.timer = setInterval(() => {
      void this.tick()
    }, intervalMs)
    // The timer must not keep the process alive on its own.
    this.timer.unref?.()
    this.logger.log(`The F12 scheduler runs every ${Math.round(intervalMs / 1000)}s.`)
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  // One pass of the job. Safe to call by hand (the tests do).
  async tick(): Promise<{ generated: number; expired: number; writtenOff: number }> {
    if (this.running) {
      this.logger.warn('The previous tick is still running; this one is skipped.')
      return { generated: 0, expired: 0, writtenOff: 0 }
    }
    this.running = true
    try {
      const generated = await this.generateCateringOrders()
      const expired = await this.expireUnpaidOrders()
      const writtenOff = await this.writeOffExpiredBatches()
      return { generated, expired, writtenOff }
    } finally {
      this.running = false
    }
  }

  // Generates the catering order of every flight that is past its
  // cutoff, and refreshes the ones that were generated before.
  private async generateCateringOrders(): Promise<number> {
    const now = this.clock.now()
    const flights = await this.db.flight.findMany({
      where: {
        status: { in: ['scheduled', 'boarding'] },
        scheduled_dep_at: { gt: now },
      },
      select: { id: true },
      orderBy: { scheduled_dep_at: 'asc' },
      take: MAX_FLIGHTS_PER_TICK,
    })

    let generated = 0
    for (const flight of flights) {
      try {
        const cutoff = await this.cateringOrders.cutoffFor(flight.id)
        if (now.getTime() < cutoff.getTime()) continue
        const existing = await this.db.catering_order.findUnique({
          where: { flight_id: flight.id },
          select: { status: true },
        })
        // A loaded or closed order is never touched.
        if (existing && (existing.status === 'loaded' || existing.status === 'closed' || existing.status === 'void')) {
          continue
        }
        await this.cateringOrders.generate(flight.id, null)
        generated += 1
      } catch (err) {
        this.logger.warn(`Could not generate the catering order of flight ${flight.id}: ${describe(err)}`)
      }
    }
    if (generated > 0) this.logger.log(`Generated ${generated} catering order(s).`)
    return generated
  }

  // Closes the customer orders that were not paid in time and gives
  // their stock back.
  private async expireUnpaidOrders(): Promise<number> {
    try {
      const expired = await this.productOrders.expireUnpaidOrders(this.clock.now())
      if (expired > 0) this.logger.log(`Expired ${expired} unpaid order(s).`)
      return expired
    } catch (err) {
      this.logger.warn(`Could not expire the unpaid orders: ${describe(err)}`)
      return 0
    }
  }

  // Writes off the batches that expired.
  private async writeOffExpiredBatches(): Promise<number> {
    try {
      const written = await this.stockBatches.writeOffExpired({}, null)
      if (written.length > 0) this.logger.log(`Wrote off ${written.length} expired batch(es).`)
      return written.length
    } catch (err) {
      this.logger.warn(`Could not write off the expired batches: ${describe(err)}`)
      return 0
    }
  }

  private enabled(): boolean {
    const raw = process.env.F12_SCHEDULER_ENABLED
    if (raw === undefined || raw === '') return true
    return raw !== 'false' && raw !== '0'
  }

  private intervalMs(): number {
    const raw = Number(process.env.F12_SCHEDULER_INTERVAL_SECONDS)
    if (!Number.isFinite(raw) || raw <= 0) return 60_000
    return raw * 1000
  }
}

// The message of an error, without the stack.
function describe(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

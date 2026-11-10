import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { BOOKING_CLOCK, type BookingClock } from '../contracts'

@Injectable()
export class SeatHoldExpiryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SeatHoldExpiryService.name)
  private timer?: ReturnType<typeof setInterval>
  private sweeping = false

  constructor(
    private readonly db: DbService,
    @Inject(BOOKING_CLOCK) private readonly clock: BookingClock,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.runSweep()
    }, 60_000)
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer)
  }

  async sweep(): Promise<number> {
    const now = this.clock.now()
    const result = await this.db.seat_assignment.updateMany({
      where: { status: 'held', hold_expires_at: { lte: now } },
      data: { status: 'released', released_at: now, updated_at: now },
    })
    return result.count
  }

  private async runSweep(): Promise<void> {
    if (this.sweeping) return
    this.sweeping = true
    try {
      await this.sweep()
    } catch (error) {
      this.logger.error('Could not release expired seat holds', error instanceof Error ? error.stack : undefined)
    } finally {
      this.sweeping = false
    }
  }
}

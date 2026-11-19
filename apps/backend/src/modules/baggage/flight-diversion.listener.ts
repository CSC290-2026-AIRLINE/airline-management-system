import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common'
import { FlightEventBus, type FlightStatusEvent } from '@backend/modules/flight-scheduling/operations/flight-event-bus'
import { BagMatchingService } from './bag-matching.service'
import { FOUND_BAG_ERROR_CODES, FoundBagError } from './common/found-bag.errors'
import { FoundBagLifecycleService, type DiversionResult } from './found-bag-lifecycle.service'

/**
 * Adds the tagged bags in the hold of a diverted flight as held found bags as soon as Feature 2 publishes
 * `flight.diverted`, and matches them against open cases, as the "Add bags" button on the Found bags page does (that
 * button stays as a backup).
 * Events arrive at least once; recordDiversion skips bags that already have a row, so a repeat adds nothing.
 */
@Injectable()
export class FlightDiversionListener implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FlightDiversionListener.name)
  private unsubscribe: (() => void) | undefined

  constructor(
    private readonly bus: FlightEventBus,
    private readonly lifecycle: FoundBagLifecycleService,
    private readonly matching: BagMatchingService,
  ) {}

  onModuleInit(): void {
    this.unsubscribe = this.bus.subscribe((event) => this.handle(event))
  }

  onModuleDestroy(): void {
    this.unsubscribe?.()
  }

  async handle(event: FlightStatusEvent): Promise<void> {
    if (event.type !== 'flight.diverted') return

    let result: DiversionResult
    try {
      result = await this.lifecycle.recordDiversion(event.flight_id)
    } catch (error) {
      // The flight has moved on (for example it was diverted and then cancelled): nothing to add, and a replay would not help.
      if (error instanceof FoundBagError && error.code === FOUND_BAG_ERROR_CODES.FLIGHT_NOT_DIVERTED) {
        this.logger.warn(`Skipped flight.diverted for ${event.flight_number}: the flight is no longer diverted`)
        return
      }
      // Anything else is reported to the bus, so Feature 2's outbox keeps the event for a replay.
      throw error
    }

    if (result.created.length > 0) {
      this.logger.log(`Added ${result.created.length} bag(s) from diverted flight ${event.flight_number} (${event.service_date})`)
      await this.matching.suggestForFoundBags(result.created.map((bag) => bag.id))
    }
  }
}

import { Inject, Injectable, Logger } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { FLIGHT_CLOCK, type FlightClock } from './flight-clock'

// Iteration-03, decided: events travel on an in-process bus inside the one application. Each event is saved with its outbox
// row in one transaction and published after commit; subscribers that missed events replay through the outbox. Field names
// follow the event-stream example and stay proposals until the week 3-4 contract lock.

export interface FlightStatusEvent {
  event_id: string
  type: `flight.${string}`
  flight_id: string
  flight_number: string
  service_date: string
  disruption_reason_code: string | null
  disruption_category: string | null
  delay_minutes: number | null
  old_dep_at: string | null
  new_dep_at: string | null
  old_arr_at: string | null
  new_arr_at: string | null
  new_destination: string | null
  old_aircraft_id: string | null
  new_aircraft_id: string | null
  hold_minutes: number | null
  resolution: string | null
  partner_airline: string | null
  occurred_at: string
  /** flight.created only: what search (3a) needs to list the flight. */
  route?: { origin: string; destination: string }
  dep_at?: string
  arr_at?: string
}

export type FlightEventHandler = (event: FlightStatusEvent) => void | Promise<void>

/**
 * Subscribers (3a, 3b, 6, 13, 14, 9) receive each event at least once; `event_id` lets them ignore a repeat. Every handler
 * runs even if another fails, and a failure is reported back so the outbox keeps the event for a replay.
 */
@Injectable()
export class FlightEventBus {
  private readonly handlers = new Set<FlightEventHandler>()

  subscribe(handler: FlightEventHandler): () => void {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  async publish(event: FlightStatusEvent): Promise<void> {
    const failures: string[] = []
    for (const handler of this.handlers) {
      try {
        await handler(event)
      } catch (error) {
        failures.push(error instanceof Error ? error.message : String(error))
      }
    }
    if (failures.length) throw new Error(failures.join('; '))
  }
}

const iso = (d: Date | null) => (d ? d.toISOString() : null)

@Injectable()
export class FlightEventPublisher {
  private readonly logger = new Logger(FlightEventPublisher.name)

  constructor(
    private readonly db: DbService,
    private readonly bus: FlightEventBus,
    @Inject(FLIGHT_CLOCK) private readonly clock: FlightClock,
  ) {}

  /**
   * Publishes events whose transaction has committed, then records delivery on the outbox. Never throws: the change is
   * already saved, so a failed delivery stays in the outbox (published_at null, attempts, last_error) for a replay.
   */
  async publishCommitted(eventIds: string[]): Promise<void> {
    for (const id of eventIds) {
      try {
        const e = await this.db.flight_event.findUnique({
          where: { id },
          include: {
            flight: {
              select: {
                flight_number: true,
                service_date: true,
                dep_at: true,
                arr_at: true,
                route: { select: { origin: true, destination: true } },
              },
            },
            disruption_reason: { select: { category: true } },
          },
        })
        if (!e) throw new Error(`event ${id} not found after commit`)
        await this.bus.publish({
          event_id: e.id,
          type: `flight.${e.type}`,
          flight_id: e.flight_id,
          flight_number: e.flight.flight_number,
          service_date: e.flight.service_date.toISOString().slice(0, 10),
          disruption_reason_code: e.disruption_reason_code,
          disruption_category: e.disruption_reason?.category ?? null,
          delay_minutes: e.delay_minutes,
          old_dep_at: iso(e.old_dep_at),
          new_dep_at: iso(e.new_dep_at),
          old_arr_at: iso(e.old_arr_at),
          new_arr_at: iso(e.new_arr_at),
          new_destination: e.new_destination,
          old_aircraft_id: e.old_aircraft_id,
          new_aircraft_id: e.new_aircraft_id,
          hold_minutes: e.hold_minutes,
          resolution: e.resolution,
          partner_airline: e.partner_airline,
          occurred_at: e.occurred_at.toISOString(),
          ...(e.type === 'created' && {
            route: e.flight.route,
            dep_at: e.flight.dep_at.toISOString(),
            arr_at: e.flight.arr_at.toISOString(),
          }),
        })
        await this.db.flight_event_outbox.update({
          where: { event_id: id },
          data: { published_at: this.clock.now(), attempts: { increment: 1 }, last_error: null },
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        this.logger.warn(`Event ${id} was saved but not delivered; it stays in the outbox: ${message}`)
        await this.db.flight_event_outbox
          .update({ where: { event_id: id }, data: { attempts: { increment: 1 }, last_error: message.slice(0, 500) } })
          .catch(() => undefined)
      }
    }
  }
}

import type { FlightEvent, FlightEventBus } from '../contracts'
import type { FlightEventCatchupService } from './flight-event-catchup.service'

interface PendingEvent {
  event: FlightEvent
  resolve: () => void
  reject: (reason: unknown) => void
}

// The supplied handler owns transactions, receipts and post-commit notifications.
export class FlightEventDispatcher {
  private unsubscribe?: () => void
  private queue: PendingEvent[] = []
  private ready = false
  private draining = false
  private stopped = false

  constructor(
    private readonly bus: FlightEventBus,
    private readonly catchup: Pick<FlightEventCatchupService, 'replay'>,
    private readonly handle: (event: FlightEvent) => Promise<void>,
  ) {}

  async start(): Promise<void> {
    if (this.unsubscribe || this.stopped) throw new Error('Flight event dispatcher cannot be started twice')
    // Subscribe first: an event committed while replay is reading must not be lost.
    this.unsubscribe = this.bus.subscribe((event) => this.enqueue(event))
    try {
      await this.catchup.replay(this.handle)
      if (this.stopped) return
      this.ready = true
      await this.drain()
    } catch (error) {
      this.stop(error)
      throw error
    }
  }

  stop(reason: unknown = new Error('Flight event dispatcher stopped')): void {
    this.stopped = true
    this.ready = false
    this.unsubscribe?.()
    this.unsubscribe = undefined
    for (const item of this.queue.splice(0)) item.reject(reason)
  }

  private enqueue(event: FlightEvent): Promise<void> {
    if (this.stopped) return Promise.reject(new Error('Flight event dispatcher stopped'))
    const result = new Promise<void>((resolve, reject) => this.queue.push({ event, resolve, reject }))
    // The individual publish promise receives the error; consume the background drain rejection.
    if (this.ready) void this.drain().catch(() => undefined)
    return result
  }

  private async drain(): Promise<void> {
    if (this.draining || !this.ready || this.stopped) return
    this.draining = true
    try {
      while (this.ready && !this.stopped && this.queue.length) {
        this.queue.sort((a, b) => (a.event.seq < b.event.seq ? -1 : a.event.seq > b.event.seq ? 1 : 0))
        const item = this.queue.shift()!
        try {
          await this.handle(item.event)
          item.resolve()
        } catch (error) {
          item.reject(error)
          // Stop rather than letting later events overtake the failure. Catch-up can retry from the missing receipt.
          this.stop(error)
          throw error
        }
      }
    } finally {
      this.draining = false
    }
  }
}

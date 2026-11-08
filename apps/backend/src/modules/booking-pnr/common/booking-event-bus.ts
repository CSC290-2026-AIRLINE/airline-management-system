import { Injectable } from '@nestjs/common'
import type { BookingEvent, BookingEventBus } from '../contracts'

type BookingEventHandler = (event: BookingEvent) => Promise<void>

// In-process bus until a platform event bus exists. Feature 13 subscribes to it; events are published after commit.
@Injectable()
export class LocalBookingEventBus implements BookingEventBus {
  private readonly handlers = new Set<BookingEventHandler>()

  subscribe(handler: BookingEventHandler): () => void {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  async publish(event: BookingEvent): Promise<void> {
    for (const handler of [...this.handlers]) {
      await handler(event)
    }
  }
}

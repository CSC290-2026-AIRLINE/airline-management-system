import { Injectable } from '@nestjs/common'
import type { FlightEvent, FlightEventBus } from '../contracts'

type FlightEventHandler = (event: FlightEvent) => Promise<void>

@Injectable()
export class LocalFlightEventBus implements FlightEventBus {
  private readonly handlers = new Set<FlightEventHandler>()

  subscribe(handler: FlightEventHandler): () => void {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  async publish(event: FlightEvent): Promise<void> {
    for (const handler of [...this.handlers]) {
      await handler(event)
    }
  }
}

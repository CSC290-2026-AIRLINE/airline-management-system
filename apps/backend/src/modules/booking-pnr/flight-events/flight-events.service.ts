import { Inject, Injectable, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common'
import { FLIGHT_EVENT_BUS, type FlightEventBus } from '../contracts'
import { FlightEventCatchupService } from './flight-event-catchup.service'
import { FlightEventDispatcher } from './flight-event-dispatcher'
import { FlightEventHandlerService } from './flight-event-handler.service'

@Injectable()
export class FlightEventsService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly dispatcher: FlightEventDispatcher
  constructor(@Inject(FLIGHT_EVENT_BUS) bus: FlightEventBus, catchup: FlightEventCatchupService, handler: FlightEventHandlerService) {
    this.dispatcher = new FlightEventDispatcher(bus, catchup, (event) => handler.handle(event))
  }
  async onApplicationBootstrap(): Promise<void> {
    await this.dispatcher.start()
  }
  onModuleDestroy(): void {
    this.dispatcher.stop()
  }
}

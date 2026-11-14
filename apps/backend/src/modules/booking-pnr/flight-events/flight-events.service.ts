import { Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common'
import { FLIGHT_EVENT_BUS, type FlightEventBus } from '../contracts'
import { FlightEventCatchupService } from './flight-event-catchup.service'
import { FlightEventDispatcher } from './flight-event-dispatcher'
import { FlightEventHandlerService } from './flight-event-handler.service'

@Injectable()
export class FlightEventsService implements OnApplicationBootstrap, OnModuleDestroy {
  private dispatcher: FlightEventDispatcher
  private readonly logger = new Logger(FlightEventsService.name)
  private timer?: ReturnType<typeof setInterval>
  private polling = false
  private restarting = false
  private stopped = false
  constructor(
    @Inject(FLIGHT_EVENT_BUS) private readonly bus: FlightEventBus,
    private readonly catchup: FlightEventCatchupService,
    private readonly handler: FlightEventHandlerService,
  ) {
    this.dispatcher = new FlightEventDispatcher(bus, catchup, (event) => handler.handle(event))
  }
  async onApplicationBootstrap(): Promise<void> {
    await this.dispatcher.start()
    // The durable event table is the recovery source even when the scheduling module is in another process or its
    // in-memory notification is missed. Publish through the same dispatcher to retain ordering and receipt checks.
    this.timer = setInterval(() => {
      void this.poll()
    }, 5000)
    this.timer.unref()
  }
  onModuleDestroy(): void {
    this.stopped = true
    if (this.timer) clearInterval(this.timer)
    this.dispatcher.stop()
  }
  async poll(): Promise<void> {
    if (this.polling || this.stopped) return
    this.polling = true
    try {
      if (this.restarting || this.dispatcher.isStopped) {
        this.dispatcher = new FlightEventDispatcher(this.bus, this.catchup, (event) => this.handler.handle(event))
        await this.dispatcher.start()
        this.restarting = false
      }
      await this.catchup.replay((event) => this.bus.publish(event))
    } catch (error) {
      this.dispatcher.stop(error)
      this.restarting = true
      this.logger.error('Could not replay pending flight events', error instanceof Error ? error.stack : undefined)
    } finally {
      this.polling = false
    }
  }
}

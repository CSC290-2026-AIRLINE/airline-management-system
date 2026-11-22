import { Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common'
import { FLIGHT_EVENT_SOURCE, type FlightEventSource } from '../contracts'
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
    @Inject(FLIGHT_EVENT_SOURCE) private readonly source: FlightEventSource,
    private readonly catchup: FlightEventCatchupService,
    private readonly handler: FlightEventHandlerService,
  ) {
    this.dispatcher = new FlightEventDispatcher(source, catchup, (event) => handler.handle(event))
  }
  async onApplicationBootstrap(): Promise<void> {
    // One bad pending event must not take the whole API down. The dispatcher has stopped, so poll() restarts it.
    try {
      await this.dispatcher.start()
    } catch (error) {
      this.restarting = true
      this.logger.error('Could not replay pending flight events at startup', error instanceof Error ? error.stack : undefined)
    }
    // The durable event table is the recovery source when a live event from Feature 2 is missed or fails. Deliver
    // through the same dispatcher to keep ordering and receipt checks, never by publishing on Feature 2's shared bus.
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
        this.dispatcher = new FlightEventDispatcher(this.source, this.catchup, (event) => this.handler.handle(event))
        await this.dispatcher.start()
        this.restarting = false
      }
      const dispatcher = this.dispatcher
      await this.catchup.replay((event) => dispatcher.deliver(event))
    } catch (error) {
      this.dispatcher.stop(error)
      this.restarting = true
      this.logger.error('Could not replay pending flight events', error instanceof Error ? error.stack : undefined)
    } finally {
      this.polling = false
    }
  }
}

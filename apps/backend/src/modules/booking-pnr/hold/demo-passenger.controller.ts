import { Controller, Get } from '@nestjs/common'
import { DemoPassengerService } from './demo-passenger.service'

// The normal JWT guard still applies. The service returns 404 outside development.
@Controller('dev/booking-passengers')
export class DemoPassengerController {
  constructor(private readonly passengers: DemoPassengerService) {}

  @Get()
  list() {
    return this.passengers.list()
  }
}

import { Body, Controller, Get, Post, ValidationPipe } from '@nestjs/common'
import { BookingError } from '../common/booking-error'
import { CreateDemoPassengersDto } from './dto/create-demo-passengers.dto'
import { DemoPassengerService } from './demo-passenger.service'

// The normal JWT guard still applies. The service returns 404 outside development.
@Controller('dev/booking-passengers')
export class DemoPassengerController {
  constructor(private readonly passengers: DemoPassengerService) {}

  @Get()
  list() {
    return this.passengers.list()
  }

  /**
   * The temporary development adapter for manually typed passenger details. Feature 7's adapter replaces it, and the
   * service returns 404 outside development.
   */
  @Post()
  create(
    @Body(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        exceptionFactory: () => new BookingError('INVALID_BOOKING_STATE', 'Invalid passenger details', 422),
      }),
    )
    request: CreateDemoPassengersDto,
  ): Promise<Array<{ id: string }>> {
    return this.passengers.create(request.passengers)
  }
}

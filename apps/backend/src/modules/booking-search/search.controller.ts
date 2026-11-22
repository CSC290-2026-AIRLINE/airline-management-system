import { Body, Controller, Post, ValidationPipe } from '@nestjs/common'
import { Public } from '@backend/auth/decorators/public.decorator'
import { BookingError } from '../booking-pnr/common/booking-error'
import { SearchFlightsDto } from './dto/search-flights.dto'
import { SearchService } from './search.service'

@Controller('search')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Public()
  @Post('flights')
  flights(
    @Body(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        exceptionFactory: () => new BookingError('INVALID_BOOKING_STATE', 'Invalid flight search criteria', 400),
      }),
    )
    request: SearchFlightsDto,
  ) {
    return this.search.search(request)
  }
}

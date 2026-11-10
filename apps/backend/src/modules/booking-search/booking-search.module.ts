import { Module } from '@nestjs/common'
import { BookingPnrModule } from '../booking-pnr/booking-pnr.module'
import { SearchController } from './search.controller'
import { SearchService } from './search.service'

@Module({
  imports: [BookingPnrModule],
  controllers: [SearchController],
  providers: [SearchService],
})
export class BookingSearchModule {}

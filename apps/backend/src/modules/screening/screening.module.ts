import { BookingsPort, StubBookingsPort, ScreeningRescreenService } from './screening-rescreen.service'
import { Module } from '@nestjs/common'
import { ScreeningAudit, ScreeningClock, ScreeningContext, SystemScreeningClock } from './screening.context'
import { ScreeningMatcher } from './screening.matcher'
import { ScreeningCheckService } from './screening-check.service'
import { ScreeningService } from './screening.service'
import { ScreeningCheckController, ScreeningController } from './screening.controller'
import { MockScreeningBooking, MockScreeningNotification, ScreeningBookingPort, ScreeningNotificationPort } from './screening.ports'
import { CheckPipe, QueuePipe, ReviewPipe } from './dto/screening.dto'

@Module({
  controllers: [ScreeningController, ScreeningCheckController],
  providers: [
    ScreeningRescreenService,
    { provide: BookingsPort, useClass: StubBookingsPort },
    ScreeningAudit,
    ScreeningContext,
    ScreeningMatcher,
    ScreeningCheckService,
    ScreeningService,
    CheckPipe,
    QueuePipe,
    ReviewPipe,
    { provide: ScreeningClock, useClass: SystemScreeningClock },
    { provide: ScreeningBookingPort, useClass: MockScreeningBooking },
    { provide: ScreeningNotificationPort, useClass: MockScreeningNotification },
  ],
  exports: [ScreeningCheckService, ScreeningRescreenService],
})
export class ScreeningModule {}

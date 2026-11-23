import { BookingsPort, StubBookingsPort, ScreeningRescreenService } from './screening-rescreen.service'
import { Module } from '@nestjs/common'
import { ScreeningAudit, ScreeningClock, ScreeningContext, SystemScreeningClock } from './screening.context'
import { ScreeningMatcher } from './screening.matcher'
import { ScreeningCheckService } from './screening-check.service'
import { ScreeningService } from './screening.service'
import { ScreeningCheckController, ScreeningController } from './screening.controller'
import { Feature13ScreeningNotification, MockScreeningBooking, ScreeningBookingPort, ScreeningNotificationPort } from './screening.ports'
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
    // Feature 13 sends the alert to the authority; the review queues it in its own transaction.
    { provide: ScreeningNotificationPort, useClass: Feature13ScreeningNotification },
  ],
  exports: [ScreeningCheckService, ScreeningRescreenService],
})
export class ScreeningModule {}

import { Controller, Get, UseGuards } from '@nestjs/common'
import type { StaffNotificationFeed } from './common/staff-notification.types'
import { BaggageStaffGuard } from './guards/baggage-staff.guard'
import { StaffNotificationService } from './staff-notification.service'

/** `/api/staff/baggage-notifications`: what the baggage desk should look at, newest first. Staff only. */
@Controller('staff/baggage-notifications')
@UseGuards(BaggageStaffGuard)
export class StaffNotificationController {
  constructor(private readonly notifications: StaffNotificationService) {}

  @Get()
  feed(): Promise<StaffNotificationFeed> {
    return this.notifications.feed()
  }
}

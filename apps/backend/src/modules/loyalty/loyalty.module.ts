import { Logger, Module, type OnModuleInit } from '@nestjs/common'
import { AdminConsoleModule } from '@backend/modules/admin-console/admin-console.module'
import { AdminConsoleService } from '@backend/modules/admin-console/admin-console.service'
import { AWARD_SEAT_PORT, SeatInventoryAwardSeats } from './award-seats.port'
import { LoyaltyStaffGuard } from './guards/loyalty-staff.guard'
import { LoyaltyAwardService } from './loyalty-award.service'
import { LoyaltyController } from './loyalty.controller'
import { LoyaltyDataService } from './loyalty-data.service'
import { LoyaltyJobScheduler } from './loyalty-job-scheduler'
import { LoyaltyJobsService } from './loyalty-jobs.service'
import { LoyaltyMemberService } from './loyalty-member.service'
import { LoyaltyRulesService } from './loyalty-rules.service'
import { LoyaltyStaffService } from './loyalty-staff.service'
import { F11_SCREENS } from './screens'
import { StaffLoyaltyController } from './staff-loyalty.controller'

/**
 * Feature 11, the loyalty programme. Imports the admin console for its audit writer, the one shared simulation clock
 * and the screen registry. `LoyaltyJobScheduler` runs the earn, tier, expiry and return-to-cash jobs on the simulation clock. Other features use `LoyaltyMemberService.tierForPassenger` in process, never over HTTP.
 */
@Module({
  imports: [AdminConsoleModule],
  controllers: [LoyaltyController, StaffLoyaltyController],
  providers: [
    LoyaltyDataService,
    LoyaltyMemberService,
    LoyaltyStaffService,
    LoyaltyRulesService,
    LoyaltyStaffGuard,
    LoyaltyJobsService,
    LoyaltyJobScheduler,
    LoyaltyAwardService,
    // Interim: writes award_limit itself until feature 3b's InventoryPort.setAwardSeats exists.
    { provide: AWARD_SEAT_PORT, useClass: SeatInventoryAwardSeats },
  ],
  // tierForPassenger for features 6 and 12; awardAvailability (3a), redeem and reverseRedemption (3b).
  exports: [LoyaltyMemberService, LoyaltyAwardService],
})
export class LoyaltyModule implements OnModuleInit {
  private readonly logger = new Logger(LoyaltyModule.name)

  constructor(private readonly adminConsole: AdminConsoleService) {}

  async onModuleInit(): Promise<void> {
    // Lets admins grant the loyalty pages to a role in Role access. A failure only delays that; the routes still work
    // for admin and loyalty-admin roles.
    try {
      await this.adminConsole.registerSelfScreens(F11_SCREENS)
    } catch (error) {
      this.logger.warn(`Could not register the F11 screens: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}

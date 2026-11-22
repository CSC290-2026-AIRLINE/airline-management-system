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
import { LoyaltyInsuranceService } from './loyalty-insurance.service'
import { LoyaltyLoungeService } from './loyalty-lounge.service'
import { LoyaltyMemberService } from './loyalty-member.service'
import { LoyaltyRulesService } from './loyalty-rules.service'
import { InterimSeatUpgrader, LOYALTY_SEAT_PORT } from './loyalty-seat.port'
import { LoyaltyStaffService } from './loyalty-staff.service'
import { LoyaltyUpgradeService } from './loyalty-upgrade.service'
import { F11_SCREENS } from './screens'
import { StaffLoyaltyController } from './staff-loyalty.controller'

/**
 * Feature 11, the loyalty programme. Imports the admin console for its audit writer, the one shared simulation clock
 * and the screen registry. `LoyaltyJobScheduler` runs the earn, return-to-cash, upgrade, tier and expiry jobs on the
 * simulation clock.
 *
 * Other features call Feature 11 in process, never over HTTP: `LoyaltyMemberService.tierForPassenger` (6, 12),
 * `LoyaltyAwardService.awardAvailability` (3a), `LoyaltyAwardService.redeem` / `reverseRedemption` and
 * `LoyaltyInsuranceService.issueInsurancePolicy` / `cancelInsurancePolicy` (3b). The upgrade job moves seats through
 * LOYALTY_SEAT_PORT; rebind it to feature 3b's `upgradeCoupon` once 3b exports it.
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
    LoyaltyLoungeService,
    LoyaltyInsuranceService,
    LoyaltyUpgradeService,
    // Interim: writes award_limit itself until feature 3b's InventoryPort.setAwardSeats exists.
    { provide: AWARD_SEAT_PORT, useClass: SeatInventoryAwardSeats },
    { provide: LOYALTY_SEAT_PORT, useClass: InterimSeatUpgrader },
  ],
  // tierForPassenger (6, 12); awardAvailability (3a), redeem, reverseRedemption and insurance (3b).
  exports: [LoyaltyMemberService, LoyaltyAwardService, LoyaltyInsuranceService],
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

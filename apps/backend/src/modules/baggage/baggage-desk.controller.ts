import { Controller, Get, Inject, UseGuards } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { FOUND_BAG_CLOCK, type FoundBagClock } from './common/found-bag.ports'
import { BaggageStaffGuard, CurrentBaggageStaff, type BaggageStaff } from './guards/baggage-staff.guard'

/** What the baggage desk sidebar shows: the simulation time and the signed-in staff member's role. */
export interface BaggageDesk {
  /** The shared simulation clock, which every Feature 10 timestamp follows. */
  now: Date
  roleCode: string
  roleName: string
}

/** `/api/staff/baggage-desk`. Staff only. */
@Controller('staff/baggage-desk')
@UseGuards(BaggageStaffGuard)
export class BaggageDeskController {
  constructor(
    private readonly db: DbService,
    @Inject(FOUND_BAG_CLOCK) private readonly clock: FoundBagClock,
  ) {}

  @Get()
  async get(@CurrentBaggageStaff() staff: BaggageStaff): Promise<BaggageDesk> {
    const role = await this.db.role.findUnique({ where: { code: staff.roleCode }, select: { name: true } })

    return { now: this.clock.now(), roleCode: staff.roleCode, roleName: role?.name ?? staff.roleCode }
  }
}

import { Injectable } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import type { CheckedBagLookup, CheckedBagOwnership } from './common/report.ports'

@Injectable()
export class PrismaCheckedBagLookup implements CheckedBagLookup {
  constructor(private readonly db: DbService) {}

  async findByTag(tagNumber: string): Promise<CheckedBagOwnership | null> {
    const bag = await this.db.checked_bag.findFirst({
      where: {
        tag_number: tagNumber,
        deleted_at: null,
      },
      select: {
        tag_number: true,
        check_in: {
          select: {
            booking_passenger_id: true,
            flight_id: true,
          },
        },
      },
    })

    if (!bag?.tag_number) {
      return null
    }

    return {
      tagNumber: bag.tag_number,
      bookingPassengerId: bag.check_in.booking_passenger_id,
      flightId: bag.check_in.flight_id,
    }
  }
}

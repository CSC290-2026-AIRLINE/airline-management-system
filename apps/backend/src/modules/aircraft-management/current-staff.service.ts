import { Injectable, UnauthorizedException } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'

/**
 * Resolves the `staff` row that owns an authenticated request. `created_by` / `updated_by` point at
 * `staff(id)`, while the access token carries the `user` id, so the staff row is looked up by
 * `staff.user_id` instead of guessing a record.
 */
@Injectable()
export class CurrentStaffService {
  constructor(private readonly db: DbService) {}

  async resolveStaffId(userId: string): Promise<string> {
    const staff = await this.db.staff.findUnique({ where: { user_id: userId }, select: { id: true } })
    if (!staff) {
      throw new UnauthorizedException('The signed-in account has no staff record')
    }
    return staff.id
  }
}

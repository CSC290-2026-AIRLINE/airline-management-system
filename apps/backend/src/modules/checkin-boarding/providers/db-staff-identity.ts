import { Injectable } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import type { StaffIdentityProvider } from './providers'

/**
 * The staff identity comes from the database: a `user` row of type `staff` is staff, and its live `staff` row
 * carries the id the feature 6 tables point at. Roles are feature 1's job and are not checked here.
 */
@Injectable()
export class DbStaffIdentity implements StaffIdentityProvider {
  constructor(private readonly db: DbService) {}

  async resolve(user: { id: string; email: string }): Promise<{ isStaff: boolean; staffId: string | null }> {
    const row = await this.db.user.findUnique({
      where: { id: user.id },
      select: { type: true, staff: { select: { id: true }, where: { deleted_at: null }, take: 1 } },
    })
    return { isStaff: row?.type === 'staff', staffId: row?.type === 'staff' ? (row.staff[0]?.id ?? null) : null }
  }
}

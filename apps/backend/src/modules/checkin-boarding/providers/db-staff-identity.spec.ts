import type { DbService } from '@backend/db/db.service'
import { DbStaffIdentity } from './db-staff-identity'

// The generated Prisma client is ESM only: the provider under test never reaches a real database.
jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

const user = { id: 'u1', email: 'a@example.com' }

function build(row: unknown) {
  const db = { user: { findUnique: jest.fn().mockResolvedValue(row) } }
  return { identity: new DbStaffIdentity(db as unknown as DbService), db }
}

describe('DbStaffIdentity', () => {
  it('a customer row is not staff', async () => {
    const { identity } = build({ type: 'customer', staff: [] })
    await expect(identity.resolve(user)).resolves.toEqual({ isStaff: false, staffId: null })
  })

  it('a staff row is staff with the staff id', async () => {
    const { identity } = build({ type: 'staff', staff: [{ id: 'staff-1' }] })
    await expect(identity.resolve(user)).resolves.toEqual({ isStaff: true, staffId: 'staff-1' })
  })

  it('an unknown user is not staff', async () => {
    const { identity } = build(null)
    await expect(identity.resolve(user)).resolves.toEqual({ isStaff: false, staffId: null })
  })

  it('a staff user without a live staff row has no staff id', async () => {
    const { identity } = build({ type: 'staff', staff: [] })
    await expect(identity.resolve(user)).resolves.toEqual({ isStaff: true, staffId: null })
  })

  it('looks the user up by id and only takes a staff row that is not deleted', async () => {
    const { identity, db } = build({ type: 'staff', staff: [{ id: 'staff-1' }] })
    await identity.resolve(user)
    expect(db.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'u1' },
      select: { type: true, staff: { select: { id: true }, where: { deleted_at: null }, take: 1 } },
    })
  })
})

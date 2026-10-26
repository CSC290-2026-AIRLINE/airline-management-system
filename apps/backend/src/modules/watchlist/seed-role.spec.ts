import type { DbService } from '@backend/db/db.service'
import { seedSecurityRole } from './seed-role'

describe('Watchlist security role seed', () => {
  const tx = { role: { upsert: jest.fn() }, staff: { findMany: jest.fn(), update: jest.fn() } }
  const db = { $transaction: jest.fn((work: (client: typeof tx) => Promise<unknown>) => work(tx)) }
  beforeEach(() => {
    jest.clearAllMocks()
    tx.role.upsert.mockResolvedValue({ id: 'role-id', code: 'security', is_admin: false })
    tx.staff.findMany.mockResolvedValue([{ id: 'staff-id', user: { clerk_user_id: 'clerk-id' } }])
  })
  it('upserts reference data without modifying staff when no email is supplied', async () => {
    await seedSecurityRole(db as unknown as DbService)
    expect(tx.role.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { code: 'security' }, create: { code: 'security', name: 'Security', is_admin: false }, update: {} }),
    )
    expect(tx.staff.findMany).not.toHaveBeenCalled()
    expect(tx.staff.update).not.toHaveBeenCalled()
  })
  it('assigns only the exact enabled Clerk-linked staff account', async () => {
    await seedSecurityRole(db as unknown as DbService, 'test@example.com')
    expect(tx.staff.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deleted_at: null,
          user: { email: { equals: 'test@example.com', mode: 'insensitive' }, type: 'staff', disabled_at: null, deleted_at: null },
        },
      }),
    )
    expect(tx.staff.update).toHaveBeenCalledWith({ where: { id: 'staff-id' }, data: { role_id: 'role-id', updated_at: expect.any(Date) } })
  })
  it.each([
    { label: 'missing', rows: [] },
    { label: 'unlinked', rows: [{ id: 'one', user: { clerk_user_id: null } }] },
    {
      label: 'ambiguous',
      rows: [
        { id: 'one', user: { clerk_user_id: 'a' } },
        { id: 'two', user: { clerk_user_id: 'b' } },
      ],
    },
  ])('rejects $label accounts before making changes', async ({ rows }) => {
    tx.staff.findMany.mockResolvedValue(rows)
    await expect(seedSecurityRole(db as unknown as DbService, 'test@example.com')).rejects.toThrow()
    expect(tx.role.upsert).not.toHaveBeenCalled()
    expect(tx.staff.update).not.toHaveBeenCalled()
  })
  it('does not assign an unexpectedly privileged security role', async () => {
    tx.role.upsert.mockResolvedValue({ id: 'role-id', code: 'security', is_admin: true })
    await expect(seedSecurityRole(db as unknown as DbService, 'test@example.com')).rejects.toThrow()
    expect(tx.staff.update).not.toHaveBeenCalled()
  })
})

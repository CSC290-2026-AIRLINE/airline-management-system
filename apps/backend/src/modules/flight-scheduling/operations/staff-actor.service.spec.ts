import { ForbiddenException, UnauthorizedException } from '@nestjs/common'
import { StaffActorService } from './staff-actor.service'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

describe('StaffActorService.staffIdFor', () => {
  const db = { staff: { findUnique: jest.fn() } }
  const service = new StaffActorService(db as never)
  const user = { id: 'u1', email: 'staff@example.test' }

  beforeEach(() => jest.resetAllMocks())

  it('returns the staff id for the signed-in user', async () => {
    db.staff.findUnique.mockResolvedValue({ id: 's1', deleted_at: null })
    await expect(service.staffIdFor(user)).resolves.toBe('s1')
    expect(db.staff.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { user_id: 'u1' } }))
  })

  it('rejects an anonymous request with 401', async () => {
    await expect(service.staffIdFor(undefined)).rejects.toThrow(UnauthorizedException)
    expect(db.staff.findUnique).not.toHaveBeenCalled()
  })

  it('rejects a user with no staff row with 403', async () => {
    db.staff.findUnique.mockResolvedValue(null)
    await expect(service.staffIdFor(user)).rejects.toThrow(ForbiddenException)
  })

  it('rejects a deleted staff member with 403', async () => {
    db.staff.findUnique.mockResolvedValue({ id: 's1', deleted_at: new Date() })
    await expect(service.staffIdFor(user)).rejects.toThrow(ForbiddenException)
  })
})

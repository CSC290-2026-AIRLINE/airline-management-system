import { ConflictException, ForbiddenException, InternalServerErrorException, ServiceUnavailableException } from '@nestjs/common'
import type { DbService } from '@backend/db/db.service'
import { ScreeningContext } from './screening.context'
import { now, staffId, userId } from './screening.test-fixtures'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

describe('Screening authorization and transaction boundary', () => {
  const tx = { staff: { findFirst: jest.fn() } }
  const db = { $transaction: jest.fn() }
  const work = jest.fn()
  let context: ScreeningContext
  beforeEach(() => {
    jest.resetAllMocks()
    tx.staff.findFirst.mockResolvedValue({ id: staffId, role: { code: 'security' } })
    db.$transaction.mockImplementation((callback: (client: unknown) => Promise<unknown>) => callback(tx))
    context = new ScreeningContext(db as unknown as DbService, { now: () => now })
  })
  it.each([null, { id: staffId, role: { code: 'admin' } }, { id: staffId, role: { code: 'check_in' } }])(
    'rejects unauthorized actors %j',
    async (actor) => {
      tx.staff.findFirst.mockResolvedValue(actor)
      await expect(context.run(userId, work)).rejects.toBeInstanceOf(ForbiddenException)
      expect(work).not.toHaveBeenCalled()
    },
  )
  it('checks disabled and deleted users inside the serializable transaction', async () => {
    await context.run(userId, work)
    expect(tx.staff.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          user_id: userId,
          deleted_at: null,
          user: { type: 'staff', disabled_at: null, deleted_at: null },
        },
      }),
    )
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' })
    expect(work).toHaveBeenCalledWith(tx, { userId, staffId, role: 'security' }, now)
  })
  it.each([
    ['P2002', ConflictException],
    ['P2034', ConflictException],
    ['P1001', ServiceUnavailableException],
  ])('maps database %s to a safe exception', async (code, exception) => {
    db.$transaction.mockRejectedValue({ code })
    await expect(context.run(userId, work)).rejects.toBeInstanceOf(exception)
  })
  it('does not expose database errors or return success after a failed audit', async () => {
    work.mockRejectedValue(new Error('private database details'))
    await expect(context.run(userId, work)).rejects.toBeInstanceOf(InternalServerErrorException)
  })
})

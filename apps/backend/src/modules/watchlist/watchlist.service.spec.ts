import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import type { DbService } from '@backend/db/db.service'
import type { Prisma, watchlist_entry } from '@backend/db/generated/prisma/client'
import { WatchlistService } from './watchlist.service'
import { WatchlistAuditService } from './watchlist.audit'
import { ListWatchlistDto } from './dto/list-watchlist.dto'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

const userId = '10000000-0000-4000-8000-000000000001'
const staffId = '20000000-0000-4000-8000-000000000001'
const entryId = '30000000-0000-4000-8000-000000000001'
const now = new Date('2026-10-22T10:00:00Z')
const row: watchlist_entry = {
  id: entryId,
  first_name: 'SOMSAK',
  last_name: 'JAIDEE',
  date_of_birth: new Date('1985-07-02T00:00:00Z'),
  nationality: 'th',
  passport_number: 'AB1239037',
  list_type: 'wanted',
  status: 'active',
  issuing_authority: 'Demo authority',
  reason: 'Case reference',
  listed_at: now,
  cleared_at: null,
  cleared_by_staff_id: null,
  clear_reason: null,
  created_by_staff_id: staffId,
  created_at: now,
  updated_at: now,
}
const input = {
  firstName: 'SOMSAK',
  lastName: 'JAIDEE',
  listType: 'wanted' as const,
  issuingAuthority: 'Demo authority',
  passportNumber: 'AB1239037',
  nationality: 'th',
}

describe('WatchlistService', () => {
  const tx = {
    watchlist_entry: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    audit_log: { create: jest.fn() },
  }
  const db = { staff: { findFirst: jest.fn() }, $transaction: jest.fn() }
  let service: WatchlistService
  beforeEach(() => {
    jest.resetAllMocks()
    db.staff.findFirst.mockResolvedValue({ id: staffId, role: { code: 'security' } })
    db.$transaction.mockImplementation((work: (client: Prisma.TransactionClient) => Promise<unknown>) =>
      work(tx as unknown as Prisma.TransactionClient),
    )
    tx.watchlist_entry.findUnique.mockResolvedValue(row)
    tx.watchlist_entry.findMany.mockResolvedValue([row])
    tx.watchlist_entry.create.mockResolvedValue(row)
    tx.watchlist_entry.update.mockResolvedValue(row)
    tx.audit_log.create.mockResolvedValue({ id: 'audit' })
    service = new WatchlistService(db as unknown as DbService, new WatchlistAuditService(), { now: () => now })
  })

  it.each([null, { id: staffId, role: { code: 'admin' } }, { id: staffId, role: { code: 'check_in' } }])(
    'denies customers, missing staff and non-security roles',
    async (actor) => {
      db.staff.findFirst.mockResolvedValue(actor)
      await expect(service.list(userId, new ListWatchlistDto())).rejects.toBeInstanceOf(ForbiddenException)
      expect(db.$transaction).not.toHaveBeenCalled()
    },
  )

  it('requires a non-deleted staff linked to a non-disabled, non-deleted staff user', async () => {
    await service.list(userId, new ListWatchlistDto())
    expect(db.staff.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          user_id: userId,
          deleted_at: null,
          user: { type: 'staff', disabled_at: null, deleted_at: null },
        },
      }),
    )
  })

  it('lists masked passports with explicit filters and a deterministic cursor', async () => {
    tx.watchlist_entry.findMany.mockResolvedValue([row, { ...row, id: '30000000-0000-4000-8000-000000000002' }])
    const query = Object.assign(new ListWatchlistDto(), { limit: 1, search: 'somsak jaidee', listType: 'wanted' })
    const result = await service.list(userId, query)
    expect(result.nextCursor).toBe(entryId)
    expect(result.items[0]).toMatchObject({ passportLast4: '9037', passportMasked: '•••• 9037', nationality: 'th' })
    expect(result.items[0]).not.toHaveProperty('passportNumber')
    expect(tx.watchlist_entry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'active', list_type: 'wanted', OR: expect.any(Array) }),
        orderBy: [{ listed_at: 'desc' }, { id: 'desc' }],
        take: 2,
      }),
    )
    expect(tx.audit_log.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'view_sensitive', actor_id: userId }) }),
    )
  })

  it('supports all statuses, empty lists and final pages', async () => {
    tx.watchlist_entry.findMany.mockResolvedValue([])
    expect(await service.list(userId, Object.assign(new ListWatchlistDto(), { status: 'all' }))).toEqual({ items: [], nextCursor: null })
    expect(tx.watchlist_entry.findMany.mock.calls[0][0].where).not.toHaveProperty('status')
  })

  it('rejects a missing cursor rather than silently restarting pagination', async () => {
    tx.watchlist_entry.findUnique.mockResolvedValue(null)
    await expect(service.list(userId, Object.assign(new ListWatchlistDto(), { cursor: entryId }))).rejects.toBeInstanceOf(
      BadRequestException,
    )
    expect(tx.watchlist_entry.findMany).not.toHaveBeenCalled()
  })

  it('does not turn punctuation-only passport searches into match-all filters', async () => {
    await service.list(userId, Object.assign(new ListWatchlistDto(), { search: '--' }))
    expect(JSON.stringify(tx.watchlist_entry.findMany.mock.calls[0][0].where)).not.toContain('"contains":""')
  })

  it('returns the full passport only from an audited detail response', async () => {
    expect(await service.get(userId, entryId)).toMatchObject({ passportNumber: 'AB1239037', dateOfBirth: '1985-07-02' })
    const audit = JSON.stringify(tx.audit_log.create.mock.calls[0][0])
    expect(audit).not.toContain('AB1239037')
    expect(audit).not.toContain('SOMSAK')
    expect(audit).not.toContain('1985-07-02')
  })

  it('returns 404 for an unknown entry', async () => {
    tx.watchlist_entry.findUnique.mockResolvedValue(null)
    await expect(service.get(userId, entryId)).rejects.toBeInstanceOf(NotFoundException)
  })

  it('creates an active record with staff and time derived on the server', async () => {
    expect(await service.create(userId, input)).toMatchObject({ id: entryId, screeningStatus: 'not_connected' })
    expect(tx.watchlist_entry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        created_by_staff_id: staffId,
        listed_at: now,
        status: 'active',
        nationality: 'th',
        passport_number: 'AB1239037',
      }),
    })
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' })
    expect(tx.audit_log.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'create', actor_id: userId, source_feature: '7' }),
    })
  })

  it('rejects future birth dates before writing', async () => {
    await expect(service.create(userId, { ...input, dateOfBirth: '2027-01-01' })).rejects.toBeInstanceOf(BadRequestException)
    expect(tx.watchlist_entry.create).not.toHaveBeenCalled()
  })

  it('applies partial edits without overwriting omitted optional fields or reactivating cleared entries', async () => {
    tx.watchlist_entry.findUnique.mockResolvedValue({ ...row, status: 'cleared', cleared_at: now })
    await service.update(userId, entryId, { reason: null })
    const data = tx.watchlist_entry.update.mock.calls[0][0].data
    expect(data).toMatchObject({ reason: null })
    expect(data).not.toHaveProperty('passport_number')
    expect(data).not.toHaveProperty('status')
    expect(data).not.toHaveProperty('cleared_at')
  })

  it('rejects an empty patch', async () => {
    await expect(service.update(userId, entryId, {})).rejects.toBeInstanceOf(BadRequestException)
    expect(tx.watchlist_entry.update).not.toHaveBeenCalled()
  })

  it('clears instead of deleting, records who/when/why and writes the audit in the transaction', async () => {
    tx.watchlist_entry.update.mockResolvedValue({ ...row, status: 'cleared', cleared_at: now })
    await service.clear(userId, entryId, '  Case withdrawn  ')
    expect(tx.watchlist_entry.update).toHaveBeenCalledWith({
      where: { id: entryId },
      data: expect.objectContaining({
        status: 'cleared',
        cleared_at: now,
        cleared_by_staff_id: staffId,
        clear_reason: 'Case withdrawn',
      }),
    })
    expect(tx.audit_log.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'status_change', reason: 'Case withdrawn' }),
    })
  })

  it('requires a non-blank clearing reason', async () => {
    await expect(service.clear(userId, entryId, '  ')).rejects.toBeInstanceOf(BadRequestException)
    expect(tx.watchlist_entry.update).not.toHaveBeenCalled()
  })

  it('does not overwrite an earlier clearing decision', async () => {
    tx.watchlist_entry.findUnique.mockResolvedValue({ ...row, status: 'cleared' })
    await expect(service.clear(userId, entryId, 'Again')).rejects.toBeInstanceOf(ConflictException)
    expect(tx.watchlist_entry.update).not.toHaveBeenCalled()
  })

  it('fails the transaction instead of reporting success if audit recording fails', async () => {
    tx.audit_log.create.mockRejectedValue(new Error('audit unavailable'))
    await expect(service.create(userId, input)).rejects.toBeInstanceOf(InternalServerErrorException)
  })

  it.each([
    ['P2034', ConflictException],
    ['P2002', ConflictException],
    ['P2025', NotFoundException],
    ['P2003', BadRequestException],
    ['P2023', BadRequestException],
    ['P1001', ServiceUnavailableException],
  ])('maps Prisma %s to a safe HTTP exception', async (code, exception) => {
    db.$transaction.mockRejectedValue({ code })
    await expect(service.get(userId, entryId)).rejects.toBeInstanceOf(exception)
  })
})

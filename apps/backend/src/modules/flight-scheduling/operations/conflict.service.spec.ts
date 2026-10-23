import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common'
import { F9_NOT_CONNECTED, PendingAircraftDirectory } from './aircraft-directory'
import { PendingAuditSink } from './audit-sink'
import { ConflictService } from './conflict.service'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

const CONFLICT = '00000000-0000-0000-0000-0000000000c1'
const FLIGHT = '00000000-0000-0000-0000-0000000000f1'
const NEW_AIRCRAFT = '00000000-0000-0000-0000-0000000000a2'
const STAFF = 'staff-1'
const SIM_NOW = new Date('2026-11-02T06:00:00Z')

describe('ConflictService', () => {
  const tx = { schedule_conflict: { findUnique: jest.fn(), update: jest.fn() } }
  const db = {
    schedule_conflict: { findMany: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn() },
    $transaction: jest.fn((fn: (t: unknown) => unknown) => fn(db)),
  }
  const operations = {
    run: jest.fn((_id: string, fn: (t: typeof tx, flight: object) => unknown) => fn(tx, { id: FLIGHT })),
    applyAircraftChange: jest.fn(),
    applyReschedule: jest.fn(),
    applyCancel: jest.fn(),
  }
  const audit = { record: jest.fn() }
  const directory = { connected: true, availability: jest.fn(), typeFacts: jest.fn() }
  const service = new ConflictService(db as never, operations as never, audit, directory, { now: () => SIM_NOW })

  const result = { flight: {}, event: { id: 'e9' }, conflicts: {}, warnings: [] }

  beforeEach(() => {
    jest.clearAllMocks()
    db.schedule_conflict.findUnique.mockResolvedValue({ id: CONFLICT, flight_id: FLIGHT, status: 'open' })
    tx.schedule_conflict.findUnique.mockResolvedValue({ status: 'open' })
    tx.schedule_conflict.update.mockResolvedValue({ id: CONFLICT, status: 'resolved' })
    for (const fn of [operations.applyAircraftChange, operations.applyReschedule, operations.applyCancel]) fn.mockResolvedValue(result)
  })

  describe('list', () => {
    it('lists open conflicts by default, newest first', async () => {
      db.schedule_conflict.findMany.mockResolvedValue([])
      await service.list({})
      expect(db.schedule_conflict.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: 'open' }, orderBy: [{ detected_at: 'desc' }, { id: 'asc' }] }),
      )
    })

    it('rejects an unknown status', async () => {
      await expect(service.list({ status: 'closed' })).rejects.toThrow(BadRequestException)
    })
  })

  describe('options', () => {
    it('offers the four resolutions, with reschedule and partner rebooking blocked by the missing tables', async () => {
      const { options } = await service.options(CONFLICT)

      expect(options.map((o) => [o.resolution, o.available])).toEqual([
        ['change_aircraft', true],
        ['reschedule', false],
        ['cancel_refund', true],
        ['rebook_partner', false],
      ])
      expect(options[1].blocked_by).toContain('schedule_approval')
      expect(options[3].blocked_by).toContain('partner_airline_route')
    })

    it('blocks change_aircraft while Feature 9 is not connected, since no aircraft can pass the gates', async () => {
      const pending = new ConflictService(db as never, operations as never, audit, new PendingAircraftDirectory(), { now: () => SIM_NOW })

      const { options } = await pending.options(CONFLICT)

      expect(options[0]).toMatchObject({ resolution: 'change_aircraft', available: false, blocked_by: F9_NOT_CONNECTED })
      expect(options.filter((o) => o.available).map((o) => o.resolution)).toEqual(['cancel_refund'])
    })

    it('marks every option unavailable on a closed conflict', async () => {
      db.schedule_conflict.findUnique.mockResolvedValue({ id: CONFLICT, flight_id: FLIGHT, status: 'dismissed' })

      const { options } = await service.options(CONFLICT)

      expect(options.every((o) => !o.available)).toBe(true)
    })

    it('returns 404 for an unknown conflict', async () => {
      db.schedule_conflict.findUnique.mockResolvedValue(null)
      await expect(service.options(CONFLICT)).rejects.toThrow(NotFoundException)
    })
  })

  describe('resolve', () => {
    it.each([
      ['change_aircraft', { resolution: 'change_aircraft', aircraft_id: NEW_AIRCRAFT }, 'applyAircraftChange'],
      ['reschedule', { resolution: 'reschedule', approval_id: CONFLICT, dep_at: SIM_NOW, arr_at: SIM_NOW }, 'applyReschedule'],
      ['cancel_refund', { resolution: 'cancel_refund', reason_code: 'ZZTX' }, 'applyCancel'],
    ] as const)('%s runs its operation and closes the conflict with the event', async (resolution, input, method) => {
      await service.resolve(CONFLICT, input, STAFF)

      expect(operations[method]).toHaveBeenCalled()
      expect(tx.schedule_conflict.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: CONFLICT },
          data: expect.objectContaining({
            status: 'resolved',
            resolution,
            partner_airline: null,
            resolution_event_id: 'e9',
            resolved_by: STAFF,
            resolved_at: SIM_NOW,
          }),
        }),
      )
    })

    it('locks the new aircraft too when changing aircraft', async () => {
      await service.resolve(CONFLICT, { resolution: 'change_aircraft', aircraft_id: NEW_AIRCRAFT }, STAFF)
      expect(operations.run).toHaveBeenCalledWith(FLIGHT, expect.any(Function), NEW_AIRCRAFT)
    })

    it('cancel_refund cancels with a refund', async () => {
      await service.resolve(CONFLICT, { resolution: 'cancel_refund', reason_code: 'ZZTX' }, STAFF)
      expect(operations.applyCancel).toHaveBeenCalledWith(
        tx,
        { id: FLIGHT },
        { reason_code: 'ZZTX', resolution: 'refund', note: undefined },
        STAFF,
      )
    })

    it('rebook_partner is passed to the cancel, and its 422 block leaves the conflict open', async () => {
      operations.applyCancel.mockRejectedValue(new UnprocessableEntityException('needs partner_airline_route'))

      await expect(
        service.resolve(CONFLICT, { resolution: 'rebook_partner', reason_code: 'ZZTX', partner_airline: 'ZP' }, STAFF),
      ).rejects.toThrow(UnprocessableEntityException)

      expect(operations.applyCancel).toHaveBeenCalledWith(
        tx,
        { id: FLIGHT },
        expect.objectContaining({ resolution: 'rebook_partner', partner_airline: 'ZP' }),
        STAFF,
      )
      expect(tx.schedule_conflict.update).not.toHaveBeenCalled()
    })

    it('refuses a conflict that is not open', async () => {
      db.schedule_conflict.findUnique.mockResolvedValue({ id: CONFLICT, flight_id: FLIGHT, status: 'resolved' })
      await expect(service.resolve(CONFLICT, { resolution: 'cancel_refund', reason_code: 'ZZTX' }, STAFF)).rejects.toThrow(
        ConflictException,
      )
      expect(operations.run).not.toHaveBeenCalled()
    })

    it('refuses when another resolver closed it before the lock was taken', async () => {
      tx.schedule_conflict.findUnique.mockResolvedValue({ status: 'resolved' })
      await expect(service.resolve(CONFLICT, { resolution: 'cancel_refund', reason_code: 'ZZTX' }, STAFF)).rejects.toThrow(
        ConflictException,
      )
      expect(operations.applyCancel).not.toHaveBeenCalled()
    })

    it('leaves the conflict open when the operation fails', async () => {
      operations.applyAircraftChange.mockRejectedValue(new ConflictException('not feasible'))
      await expect(service.resolve(CONFLICT, { resolution: 'change_aircraft', aircraft_id: NEW_AIRCRAFT }, STAFF)).rejects.toThrow(
        'not feasible',
      )
      expect(tx.schedule_conflict.update).not.toHaveBeenCalled()
    })
  })

  describe('dismiss', () => {
    it('closes the conflict and writes the reason to the audit log inside the same transaction', async () => {
      db.schedule_conflict.updateMany.mockResolvedValue({ count: 1 })

      await service.dismiss(CONFLICT, { reason: 'Handled by phone' }, STAFF)

      expect(db.$transaction).toHaveBeenCalled()
      expect(db.schedule_conflict.updateMany).toHaveBeenCalledWith({
        where: { id: CONFLICT, status: 'open' },
        data: expect.objectContaining({ status: 'dismissed', resolved_by: STAFF, resolved_at: SIM_NOW }),
      })
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'schedule_conflict.dismissed', entityId: CONFLICT, actorId: STAFF, reason: 'Handled by phone' }),
      )
    })

    it('fails with the audit error, so the transaction rolls back, while Feature 15 is not connected', async () => {
      db.schedule_conflict.updateMany.mockResolvedValue({ count: 1 })
      const pending = new ConflictService(db as never, operations as never, new PendingAuditSink(), directory, { now: () => SIM_NOW })

      await expect(pending.dismiss(CONFLICT, { reason: 'x' }, STAFF)).rejects.toThrow(BadGatewayException)
    })

    it('refuses a conflict another user closed first, before any audit entry is written', async () => {
      db.schedule_conflict.updateMany.mockResolvedValue({ count: 0 })
      await expect(service.dismiss(CONFLICT, { reason: 'x' }, STAFF)).rejects.toThrow(ConflictException)
      expect(audit.record).not.toHaveBeenCalled()
    })

    it('refuses a conflict that is not open', async () => {
      db.schedule_conflict.findUnique.mockResolvedValue({ id: CONFLICT, flight_id: FLIGHT, status: 'superseded' })
      await expect(service.dismiss(CONFLICT, { reason: 'x' }, STAFF)).rejects.toThrow(ConflictException)
    })
  })
})

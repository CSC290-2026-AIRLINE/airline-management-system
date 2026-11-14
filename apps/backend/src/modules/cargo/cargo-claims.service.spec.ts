import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common'
import { CargoClaimsService } from './cargo-claims.service'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

const NOW = new Date('2026-11-10T12:00:00Z')

jest.mock('@backend/modules/pricing/fare-quote/sim-clock', () => ({
  simNow: () => NOW,
}))

function makeDb() {
  return {
    cargo_booking: {
      findUnique: jest.fn(),
    },
    cargo_shipment_event: {
      findFirst: jest.fn(),
    },
    cargo_setting: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    cargo_claim: {
      create: jest.fn(),
      findUnique: jest.fn(),
    },
    cargo_claim_decision: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    cargo_notice: {
      create: jest.fn(),
    },
    staff: {
      findFirst: jest.fn(),
    },
    $queryRaw: jest.fn(),
    $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn(null)),
  }
}

function deliveredBooking(overrides: Record<string, unknown> = {}) {
  return {
    id: 'b1',
    booking_ref: 'CB-000001',
    customer_id: 'c1',
    pieces: 5,
    quoted_charge: '200.00',
    currency: 'USD',
    cargo_shipment_event: [{ status_after: 'delivered' }],
    ...overrides,
  }
}

describe('CargoClaimsService', () => {
  let service: CargoClaimsService
  let db: ReturnType<typeof makeDb>

  beforeEach(() => {
    db = makeDb()
    service = new CargoClaimsService(db as never)
  })

  describe('fileClaim', () => {
    const input = { claim_type: 'damage' as const, pieces_affected: 1, description: 'Broken', claimed_amount: 50 }

    it('rejects when booking is not delivered', async () => {
      db.cargo_booking.findUnique.mockResolvedValue({
        ...deliveredBooking(),
        cargo_shipment_event: [{ status_after: 'accepted' }],
      })

      await expect(service.fileClaim('b1', 'c1', input)).rejects.toThrow(ConflictException)
    })

    it('rejects when booking belongs to a different customer', async () => {
      db.cargo_booking.findUnique.mockResolvedValue(deliveredBooking({ customer_id: 'other' }))

      await expect(service.fileClaim('b1', 'c1', input)).rejects.toThrow(NotFoundException)
    })

    it('rejects when outside the claim window', async () => {
      db.cargo_booking.findUnique.mockResolvedValue(deliveredBooking())
      db.cargo_shipment_event.findFirst.mockResolvedValue({
        occurred_at: new Date('2026-10-01T00:00:00Z'),
      })

      await expect(service.fileClaim('b1', 'c1', input)).rejects.toThrow(ConflictException)
    })

    it('rejects a second claim on the same booking (P2002)', async () => {
      db.cargo_booking.findUnique.mockResolvedValue(deliveredBooking())
      db.cargo_shipment_event.findFirst.mockResolvedValue({ occurred_at: new Date('2026-11-09T00:00:00Z') })
      db.cargo_claim.create.mockRejectedValue({
        code: 'P2002',
        meta: { target: ['cargo_booking_id'] },
      })

      await expect(service.fileClaim('b1', 'c1', input)).rejects.toThrow(ConflictException)
    })

    it('rejects pieces_affected above booking pieces', async () => {
      db.cargo_booking.findUnique.mockResolvedValue(deliveredBooking())
      db.cargo_shipment_event.findFirst.mockResolvedValue({ occurred_at: new Date('2026-11-09T00:00:00Z') })

      await expect(service.fileClaim('b1', 'c1', { ...input, pieces_affected: 10 })).rejects.toThrow(BadRequestException)
    })

    it('creates a claim successfully', async () => {
      db.cargo_booking.findUnique.mockResolvedValue(deliveredBooking())
      db.cargo_shipment_event.findFirst.mockResolvedValue({ occurred_at: new Date('2026-11-09T00:00:00Z') })
      db.cargo_claim.create.mockResolvedValue({ id: 'claim-1', claim_ref: 'CL-ABC123' })

      const result = await service.fileClaim('b1', 'c1', input)
      expect(result).toEqual({ id: 'claim-1', claimRef: 'CL-ABC123' })
    })
  })

  describe('decideClaim', () => {
    beforeEach(() => {
      db.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          $queryRaw: jest.fn().mockResolvedValue([{ id: 'cl1', cargo_booking_id: 'b1', claim_ref: 'CL-AAA111', claimed_amount: '100.00' }]),
          cargo_claim_decision: {
            findUnique: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockResolvedValue({}),
          },
          cargo_notice: { create: jest.fn().mockResolvedValue({}) },
        }
        return fn(tx)
      })
    })

    it('rejects a second decision', async () => {
      db.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          $queryRaw: jest.fn().mockResolvedValue([{ id: 'cl1', cargo_booking_id: 'b1', claim_ref: 'CL-AAA111', claimed_amount: '100.00' }]),
          cargo_claim_decision: {
            findUnique: jest.fn().mockResolvedValue({ id: 'existing' }),
            create: jest.fn(),
          },
          cargo_notice: { create: jest.fn() },
        }
        return fn(tx)
      })

      await expect(service.decideClaim('cl1', 'staff1', { decision: 'approved', approved_amount: 50, note: 'ok' })).rejects.toThrow(
        ConflictException,
      )
    })

    it('rejects approved_amount above claimed', async () => {
      await expect(service.decideClaim('cl1', 'staff1', { decision: 'approved', approved_amount: 200, note: 'over' })).rejects.toThrow(
        BadRequestException,
      )
    })

    it('approves successfully', async () => {
      const result = await service.decideClaim('cl1', 'staff1', { decision: 'approved', approved_amount: 80, note: 'ok' })
      expect(result).toEqual({ decision: 'approved' })
    })

    it('rejects successfully', async () => {
      const result = await service.decideClaim('cl1', 'staff1', { decision: 'rejected', note: 'no' })
      expect(result).toEqual({ decision: 'rejected' })
    })
  })
})

const NOW = new Date('2026-11-10T12:00:00Z')

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))
jest.mock('@backend/modules/pricing/fare-quote/sim-clock', () => ({
  simNow: () => NOW,
}))

import { refundFull } from './cargo-deps'

function makeDb() {
  return {
    aircraft: { findUnique: jest.fn() },
    flight_setting: { findFirst: jest.fn() },
    refund: {
      create: jest.fn(),
      findFirst: jest.fn(),
    },
  }
}

describe('refundFull', () => {
  it('maps cancel reason to cargo_cancel and status to succeeded', async () => {
    const db = makeDb()
    db.refund.findFirst.mockResolvedValue(null)
    db.refund.create.mockResolvedValue({ id: 'r-1' })

    await refundFull(db as never, 'CB-000001', 'pay-1', 100, 'cancel')
    expect(db.refund.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        reason: 'cargo_cancel',
        status: 'succeeded',
        source_key: 'cargo:CB-000001:cancel',
        completed_at: NOW,
      }),
    })
  })

  it('maps rejected reason to cargo_rejected', async () => {
    const db = makeDb()
    db.refund.findFirst.mockResolvedValue(null)
    db.refund.create.mockResolvedValue({ id: 'r-2' })

    await refundFull(db as never, 'CB-000002', 'pay-2', 200, 'rejected')
    expect(db.refund.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ reason: 'cargo_rejected' }),
    })
  })

  it('maps flight reason to flight_cancelled', async () => {
    const db = makeDb()
    db.refund.findFirst.mockResolvedValue(null)
    db.refund.create.mockResolvedValue({ id: 'r-3' })

    await refundFull(db as never, 'CB-000003', 'pay-3', 300, 'flight')
    expect(db.refund.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ reason: 'flight_cancelled' }),
    })
  })

  it('returns existing refund by source_key (idempotent)', async () => {
    const db = makeDb()
    db.refund.findFirst.mockResolvedValue({ id: 'existing-r' })

    const result = await refundFull(db as never, 'CB-000001', 'pay-1', 100, 'cancel')
    expect(result).toEqual({ refundId: 'existing-r' })
    expect(db.refund.create).not.toHaveBeenCalled()
  })

  it('catches P2002 unique violation and returns existing row', async () => {
    const db = makeDb()
    db.refund.findFirst.mockResolvedValueOnce(null)
    db.refund.create.mockRejectedValue({ code: 'P2002' })
    db.refund.findFirst.mockResolvedValueOnce({ id: 'race-r' })

    const result = await refundFull(db as never, 'CB-000001', 'pay-1', 100, 'cancel')
    expect(result).toEqual({ refundId: 'race-r' })
  })

  it('uses a stable source_key without Date.now()', async () => {
    const db = makeDb()
    db.refund.findFirst.mockResolvedValue(null)
    db.refund.create.mockResolvedValue({ id: 'r-x' })

    await refundFull(db as never, 'CB-000001', 'pay-1', 100, 'cancel')
    const call = db.refund.create.mock.calls[0][0].data
    expect(call.source_key).toBe('cargo:CB-000001:cancel')
    expect(call.source_key).not.toMatch(/\d{13}/)
  })
})

import { BadRequestException, NotFoundException } from '@nestjs/common'
import { ApprovalPolicyService } from './approval-policy.service'

jest.mock('@backend/db/db.service', () => ({ DbService: class {} }))

describe('ApprovalPolicyService', () => {
  const db = {
    airport: { findUnique: jest.fn() },
    airport_approval_policy: { findUnique: jest.fn(), upsert: jest.fn() },
  }
  const service = new ApprovalPolicyService(db as never)
  const time = (hhmm: string) => new Date(`1970-01-01T${hhmm}:00Z`)

  beforeEach(() => {
    jest.resetAllMocks()
    db.airport.findUnique.mockResolvedValue({ iata_code: 'BKK' })
  })

  describe('get', () => {
    it('returns the stored policy with HH:MM times', async () => {
      db.airport_approval_policy.findUnique.mockResolvedValue({
        curfew_start_local: time('23:00'),
        curfew_end_local: time('06:00'),
        max_departure_per_hour: 8,
        offer_style: 'window',
      })
      await expect(service.get('bkk')).resolves.toEqual({
        airport: 'BKK',
        curfew_start_local: '23:00',
        curfew_end_local: '06:00',
        max_departure_per_hour: 8,
        offer_style: 'window',
      })
    })

    it('answers "no curfew, no cap" when the airport has no policy row', async () => {
      db.airport_approval_policy.findUnique.mockResolvedValue(null)
      await expect(service.get('BKK')).resolves.toEqual({
        airport: 'BKK',
        curfew_start_local: null,
        curfew_end_local: null,
        max_departure_per_hour: null,
        offer_style: 'slots',
      })
    })

    it('returns 404 for an unknown airport', async () => {
      db.airport.findUnique.mockResolvedValue(null)
      await expect(service.get('ZZZ')).rejects.toThrow(NotFoundException)
    })
  })

  describe('save', () => {
    beforeEach(() => db.airport_approval_policy.findUnique.mockResolvedValue(null))

    it('upserts the policy', async () => {
      await service.save('bkk', {
        curfew_start_local: '00:00',
        curfew_end_local: '05:00',
        max_departure_per_hour: 20,
        offer_style: 'slots',
      })
      expect(db.airport_approval_policy.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { airport: 'BKK' },
          create: {
            airport: 'BKK',
            curfew_start_local: time('00:00'),
            curfew_end_local: time('05:00'),
            max_departure_per_hour: 20,
            offer_style: 'slots',
          },
        }),
      )
    })

    it('clears the curfew and the cap when they are null', async () => {
      await service.save('BKK', { curfew_start_local: null, curfew_end_local: null, max_departure_per_hour: null })
      expect(db.airport_approval_policy.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: { airport: 'BKK', curfew_start_local: null, curfew_end_local: null, max_departure_per_hour: null, offer_style: 'slots' },
        }),
      )
    })

    it.each([
      ['one curfew time only', { curfew_start_local: '22:00' }],
      ['equal curfew times', { curfew_start_local: '22:00', curfew_end_local: '22:00' }],
      ['a bad time', { curfew_start_local: '25:00', curfew_end_local: '06:00' }],
      ['a zero cap', { max_departure_per_hour: 0 }],
      ['a fractional cap', { max_departure_per_hour: 2.5 }],
      ['an unknown offer style', { offer_style: 'list' }],
    ])('rejects %s with 400', async (_name, body) => {
      await expect(service.save('BKK', body)).rejects.toThrow(BadRequestException)
      expect(db.airport_approval_policy.upsert).not.toHaveBeenCalled()
    })

    it('returns 404 for an unknown airport before writing', async () => {
      db.airport.findUnique.mockResolvedValue(null)
      await expect(service.save('ZZZ', {})).rejects.toThrow(NotFoundException)
      expect(db.airport_approval_policy.upsert).not.toHaveBeenCalled()
    })
  })
})

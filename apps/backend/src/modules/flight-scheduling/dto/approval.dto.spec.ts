import { BadRequestException } from '@nestjs/common'
import { parseApprovalRequestBody, parseRespondBody, parseReviseBody } from './approval.dto'

const ID = '00000000-0000-0000-0000-0000000000a1'
const request = (over: object = {}) => ({
  purpose: 'new_flight',
  route_id: ID,
  flight_number: 'zz101',
  service_date: '2026-11-02',
  aircraft_id: ID,
  dep_at: '2026-11-02T03:00:00Z',
  arr_at: '2026-11-02T05:00:00Z',
  ...over,
})

describe('approval request bodies', () => {
  describe('parseApprovalRequestBody', () => {
    it('reads a new flight and upper-cases the flight number', () => {
      expect(parseApprovalRequestBody(request())).toMatchObject({ purpose: 'new_flight', flight_number: 'ZZ101', flight_id: undefined })
    })

    it('needs flight_id for a reschedule, and only for a reschedule', () => {
      expect(() => parseApprovalRequestBody(request({ purpose: 'reschedule' }))).toThrow(BadRequestException)
      expect(() => parseApprovalRequestBody(request({ flight_id: ID }))).toThrow(BadRequestException)
      expect(parseApprovalRequestBody(request({ purpose: 'reschedule', flight_id: ID })).flight_id).toBe(ID)
    })

    it('rejects an arrival that is not after the departure, and a time without an offset', () => {
      expect(() => parseApprovalRequestBody(request({ arr_at: '2026-11-02T03:00:00Z' }))).toThrow(BadRequestException)
      expect(() => parseApprovalRequestBody(request({ dep_at: '2026-11-02T03:00:00' }))).toThrow(BadRequestException)
    })
  })

  describe('parseRespondBody', () => {
    it('reads approve, reject and offer', () => {
      expect(parseRespondBody({ answer: 'approve', note: ' ok ' })).toEqual({ answer: 'approve', note: 'ok' })
      expect(parseRespondBody({ answer: 'reject', reject_reason: 'curfew' })).toMatchObject({ answer: 'reject', reject_reason: 'curfew' })
      const offer = parseRespondBody({
        answer: 'offer',
        offers: [{ starts_at: '2026-11-02T04:00:00Z' }, { starts_at: '2026-11-02T06:00:00Z', ends_at: '2026-11-02T07:00:00Z' }],
      })
      expect(offer).toMatchObject({
        answer: 'offer',
        offers: [{ starts_at: new Date('2026-11-02T04:00:00Z') }, { ends_at: new Date('2026-11-02T07:00:00Z') }],
      })
    })

    it.each([
      ['an unknown answer', { answer: 'maybe' }],
      ['a reject without a reason', { answer: 'reject' }],
      ['a reject with an unknown reason', { answer: 'reject', reject_reason: 'rain' }],
      ['an offer with no times', { answer: 'offer', offers: [] }],
      [
        'an offer window that ends before it starts',
        { answer: 'offer', offers: [{ starts_at: '2026-11-02T06:00:00Z', ends_at: '2026-11-02T05:00:00Z' }] },
      ],
      [
        'two offers at the same time',
        { answer: 'offer', offers: [{ starts_at: '2026-11-02T06:00:00Z' }, { starts_at: '2026-11-02T06:00:00Z' }] },
      ],
    ])('rejects %s with 400', (_name, body) => {
      expect(() => parseRespondBody(body)).toThrow(BadRequestException)
    })
  })

  describe('parseReviseBody', () => {
    it('reads the new times and an optional aircraft', () => {
      expect(parseReviseBody({ dep_at: '2026-11-02T04:00:00Z', arr_at: '2026-11-02T06:00:00Z' })).toMatchObject({ aircraft_id: undefined })
      expect(parseReviseBody({ dep_at: '2026-11-02T04:00:00Z', arr_at: '2026-11-02T06:00:00Z', aircraft_id: ID }).aircraft_id).toBe(ID)
    })

    it('rejects an arrival that is not after the departure', () => {
      expect(() => parseReviseBody({ dep_at: '2026-11-02T04:00:00Z', arr_at: '2026-11-02T04:00:00Z' })).toThrow(BadRequestException)
    })
  })
})

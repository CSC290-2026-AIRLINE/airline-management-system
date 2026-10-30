import { BadRequestException } from '@nestjs/common'
import {
  parseCancelBody,
  parseConfirmBody,
  parseDelayBody,
  parseDismissBody,
  parseDivertBody,
  parseEndHoldBody,
  parseHoldBody,
  parseResolveBody,
} from './operations.dto'

const APPROVAL = '00000000-0000-0000-0000-0000000000b1'

const errorsOf = (fn: () => unknown): string[] => {
  try {
    fn()
  } catch (e) {
    if (e instanceof BadRequestException) return ([] as string[]).concat((e.getResponse() as { message: string | string[] }).message)
    throw e
  }
  throw new Error('expected a BadRequestException')
}

describe('operations DTO parsers', () => {
  it('parses a delay and upper-cases the reason code', () => {
    expect(parseDelayBody({ reason_code: 'zzwx', delay_minutes: 30, note: ' late crew ' })).toEqual({
      reason_code: 'ZZWX',
      delay_minutes: 30,
      note: 'late crew',
    })
  })

  it('collects every delay error at once', () => {
    expect(errorsOf(() => parseDelayBody({ delay_minutes: 0 }))).toEqual([
      'reason_code is required',
      'delay_minutes must be a positive whole number of minutes',
    ])
  })

  it('sets no business maximum on a delay', () => {
    expect(parseDelayBody({ reason_code: 'ZZWX', delay_minutes: 3000 }).delay_minutes).toBe(3000)
    expect(errorsOf(() => parseDelayBody({ reason_code: 'ZZWX', delay_minutes: 2.5 }))).toEqual([
      'delay_minutes must be a positive whole number of minutes',
    ])
  })

  it('parses a hold and allows an empty body to end one', () => {
    expect(parseHoldBody({ reason_code: 'zzat', hold_minutes: 20 })).toEqual({ reason_code: 'ZZAT', hold_minutes: 20 })
    expect(errorsOf(() => parseHoldBody({ hold_minutes: 0 }))).toEqual([
      'reason_code is required',
      'hold_minutes must be a positive whole number of minutes',
    ])
    expect(parseEndHoldBody(undefined)).toEqual({})
    expect(parseEndHoldBody({ note: ' landed ' })).toEqual({ note: 'landed' })
  })

  it('rejects a non-object body', () => {
    expect(() => parseDelayBody([])).toThrow('body must be a JSON object')
  })

  it('checks the diversion airport code', () => {
    expect(errorsOf(() => parseDivertBody({ reason_code: 'ZZWX', airport_code: 'ZZDD' }))).toEqual(['airport_code must be 3 letters'])
  })

  it('needs a partner only when rebooking on a partner', () => {
    expect(parseCancelBody({ reason_code: 'ZZTX', resolution: 'refund' }).partner_airline).toBeUndefined()
    expect(errorsOf(() => parseCancelBody({ reason_code: 'ZZTX', resolution: 'rebook_partner' }))).toEqual(['partner_airline is required'])
    expect(errorsOf(() => parseCancelBody({ reason_code: 'ZZTX', resolution: 'void' }))).toEqual([
      'resolution must be refund or rebook_partner',
    ])
  })

  it('parses each resolution', () => {
    const aircraft = '00000000-0000-0000-0000-0000000000a2'
    expect(parseResolveBody({ resolution: 'change_aircraft', aircraft_id: aircraft })).toMatchObject({ aircraft_id: aircraft })
    expect(
      parseResolveBody({
        resolution: 'reschedule',
        approval_id: APPROVAL,
        dep_at: '2026-11-02T12:00:00Z',
        arr_at: '2026-11-02T21:00:00+07:00',
      }),
    ).toMatchObject({ dep_at: new Date('2026-11-02T12:00:00Z'), arr_at: new Date('2026-11-02T14:00:00Z') })
    expect(parseResolveBody({ resolution: 'cancel_refund', reason_code: 'zztx' })).toEqual({
      resolution: 'cancel_refund',
      reason_code: 'ZZTX',
    })
    expect(parseResolveBody({ resolution: 'rebook_partner', reason_code: 'ZZTX', partner_airline: 'zp' })).toMatchObject({
      partner_airline: 'ZP',
    })
  })

  it('rejects reschedule times without an offset or out of order', () => {
    expect(
      errorsOf(() =>
        parseResolveBody({
          resolution: 'reschedule',
          approval_id: APPROVAL,
          dep_at: '2026-11-02T12:00:00',
          arr_at: '2026-11-02T14:00:00Z',
        }),
      ),
    ).toEqual(['dep_at must be an ISO 8601 date-time with an offset'])
    expect(
      errorsOf(() =>
        parseResolveBody({
          resolution: 'reschedule',
          approval_id: APPROVAL,
          dep_at: '2026-11-02T12:00:00Z',
          arr_at: '2026-11-02T11:00:00Z',
        }),
      ),
    ).toEqual(['arr_at must be after dep_at'])
  })

  it('rejects an unknown resolution and a dismissal without a reason', () => {
    expect(() => parseResolveBody({ resolution: 'auto' })).toThrow(BadRequestException)
    expect(errorsOf(() => parseDismissBody({ reason: '  ' }))).toEqual(['reason is required'])
  })

  describe('parseConfirmBody', () => {
    const valid = {
      approval_id: APPROVAL,
      route_id: '00000000-0000-0000-0000-0000000000c2',
      flight_number: 'zz101',
      service_date: '2026-11-03',
      aircraft_id: '00000000-0000-0000-0000-0000000000a1',
      scheduled_dep_at: '2026-11-02T18:00:00Z',
      scheduled_arr_at: '2026-11-02T20:00:00Z',
    }

    it('parses a proposed flight with its approval', () => {
      expect(parseConfirmBody(valid)).toMatchObject({ flight_number: 'ZZ101', service_date: new Date('2026-11-03T00:00:00Z') })
    })

    it('requires the approval and a valid service date', () => {
      expect(errorsOf(() => parseConfirmBody({ ...valid, approval_id: undefined, service_date: '2026-02-30' }))).toEqual([
        'approval_id is required',
        'service_date must be YYYY-MM-DD',
      ])
    })

    it('rejects an arrival not after the departure', () => {
      expect(errorsOf(() => parseConfirmBody({ ...valid, scheduled_arr_at: valid.scheduled_dep_at }))).toEqual([
        'scheduled_arr_at must be after scheduled_dep_at',
      ])
    })
  })
})

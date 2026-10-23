import { buildFlightEvent, InvalidFlightEventError } from './flight-events'

const at = (hhmm: string) => new Date(`2026-11-02T${hhmm}:00Z`)
const A1 = '00000000-0000-0000-0000-0000000000a1'
const A2 = '00000000-0000-0000-0000-0000000000a2'

describe('buildFlightEvent', () => {
  it('created: records the first times and aircraft, status scheduled', () => {
    const e = buildFlightEvent({ type: 'created', depAt: at('09:00'), arrAt: at('11:00'), aircraftId: A1 })
    expect(e.status).toBe('scheduled')
    expect(e.columns).toMatchObject({ type: 'created', new_dep_at: at('09:00'), new_arr_at: at('11:00'), new_aircraft_id: A1 })
  })

  it('delayed: shifts both times by the delay, status delayed', () => {
    const e = buildFlightEvent({ type: 'delayed', reasonCode: 'ZZWX', delayMinutes: 45, oldDepAt: at('09:00'), oldArrAt: at('11:00') })
    expect(e.status).toBe('delayed')
    expect(e.columns).toMatchObject({
      disruption_reason_code: 'ZZWX',
      delay_minutes: 45,
      old_dep_at: at('09:00'),
      new_dep_at: at('09:45'),
      old_arr_at: at('11:00'),
      new_arr_at: at('11:45'),
    })
  })

  it.each([0, -5, 1.5])('delayed: rejects %p minutes', (delayMinutes) => {
    expect(() =>
      buildFlightEvent({ type: 'delayed', reasonCode: 'ZZWX', delayMinutes, oldDepAt: at('09:00'), oldArrAt: at('11:00') }),
    ).toThrow(InvalidFlightEventError)
  })

  it('delayed: requires a reason code', () => {
    expect(() =>
      buildFlightEvent({ type: 'delayed', reasonCode: ' ', delayMinutes: 10, oldDepAt: at('09:00'), oldArrAt: at('11:00') }),
    ).toThrow('reason_code is required')
  })

  it('rescheduled: records old and new times, status back to scheduled', () => {
    const e = buildFlightEvent({
      type: 'rescheduled',
      oldDepAt: at('09:00'),
      newDepAt: at('12:00'),
      oldArrAt: at('11:00'),
      newArrAt: at('14:00'),
    })
    expect(e.status).toBe('scheduled')
    expect(e.columns).toMatchObject({ new_dep_at: at('12:00'), new_arr_at: at('14:00'), disruption_reason_code: null })
  })

  it('rescheduled: rejects an arrival not after the departure', () => {
    expect(() =>
      buildFlightEvent({ type: 'rescheduled', oldDepAt: at('09:00'), newDepAt: at('12:00'), oldArrAt: at('11:00'), newArrAt: at('12:00') }),
    ).toThrow(InvalidFlightEventError)
  })

  it('aircraft_changed: records both aircraft and leaves the status alone', () => {
    const e = buildFlightEvent({ type: 'aircraft_changed', oldAircraftId: A1, newAircraftId: A2 })
    expect(e.status).toBeNull()
    expect(e.columns).toMatchObject({ old_aircraft_id: A1, new_aircraft_id: A2 })
  })

  it('aircraft_changed: rejects the same aircraft', () => {
    expect(() => buildFlightEvent({ type: 'aircraft_changed', oldAircraftId: A1, newAircraftId: A1 })).toThrow(InvalidFlightEventError)
  })

  it('holding: extends the arrival with the reason, status holding', () => {
    const e = buildFlightEvent({ type: 'holding', reasonCode: 'ZZAT', holdMinutes: 20, oldArrAt: at('11:00') })
    expect(e).toMatchObject({
      status: 'holding',
      columns: { hold_minutes: 20, disruption_reason_code: 'ZZAT', old_arr_at: at('11:00'), new_arr_at: at('11:20') },
    })
  })

  it('holding: rejects zero minutes and a missing reason', () => {
    expect(() => buildFlightEvent({ type: 'holding', reasonCode: 'ZZAT', holdMinutes: 0, oldArrAt: at('11:00') })).toThrow(
      InvalidFlightEventError,
    )
    expect(() => buildFlightEvent({ type: 'holding', reasonCode: '', holdMinutes: 10, oldArrAt: at('11:00') })).toThrow(
      'reason_code is required',
    )
  })

  it('hold_ended: status departed', () => {
    expect(buildFlightEvent({ type: 'hold_ended' }).status).toBe('departed')
  })

  it('diverted: records the new destination and reason, status diverted', () => {
    const e = buildFlightEvent({ type: 'diverted', reasonCode: 'ZZWX', newDestination: 'ZZD' })
    expect(e).toMatchObject({ status: 'diverted', columns: { new_destination: 'ZZD', disruption_reason_code: 'ZZWX' } })
  })

  it('cancelled with refund: no partner, status cancelled', () => {
    const e = buildFlightEvent({ type: 'cancelled', reasonCode: 'ZZTX', resolution: 'refund', partnerAirline: 'ZP' })
    expect(e).toMatchObject({ status: 'cancelled', columns: { resolution: 'refund', partner_airline: null } })
  })

  it('cancelled with partner rebooking: requires the partner', () => {
    const e = buildFlightEvent({ type: 'cancelled', reasonCode: 'ZZTX', resolution: 'rebook_partner', partnerAirline: 'ZP' })
    expect(e.columns.partner_airline).toBe('ZP')
    expect(() => buildFlightEvent({ type: 'cancelled', reasonCode: 'ZZTX', resolution: 'rebook_partner' })).toThrow(
      'partner_airline is required',
    )
  })

  it('keeps unrelated columns null and trims the note', () => {
    const e = buildFlightEvent({ type: 'hold_ended', note: '  ok  ' })
    expect(e.columns).toMatchObject({ note: 'ok', delay_minutes: null, new_destination: null, resolution: null })
    expect(buildFlightEvent({ type: 'hold_ended', note: '   ' }).columns.note).toBeNull()
  })
})

import { CheckInError } from '../errors'
import { FixtureClock } from '../providers/fixture-providers'
import { CheckInStore } from './checkin-store'

const store = () => {
  const s = new CheckInStore()
  s.seedDemo(new FixtureClock())
  return s
}

describe('CheckInStore', () => {
  it('seeds 13 checked-in passengers, two gates and two boarding rows', () => {
    const s = store()
    expect(s.listCheckInsByFlight('flt-fy204')).toHaveLength(8)
    expect(s.listCheckInsByFlight('flt-fy318')).toHaveLength(5)
    expect(s.flightBoarding('flt-fy204')?.gate_id).toBe('gate-a1')
    expect(s.flightBoarding('flt-fy318')?.gate_id).toBe('gate-a2')
    expect(s.listGates().map((g) => g.code)).toEqual(['A1', 'A2'])
    expect(s.passByReference('H3VN8PLA')).toBeTruthy()
    expect(s.getCheckIn(s.passByReference('H3VN8PLA')!.check_in_id)?.status).toBe('on_hold')
    expect(s.listPasses()).toHaveLength(13)
  })

  it('seeds a document per check-in with only the last four characters', () => {
    const s = store()
    const dana = s.passByReference('H3VN8PLA')!
    const document = s.getDocumentByCheckIn(dana.check_in_id)!
    expect(document.number_last4).toBe('0000')
    expect(JSON.stringify(s.listDocuments())).not.toContain('SEC000000')
  })

  it('appendEvent allows one final event per pass', () => {
    const s = store()
    const pass = s.passByReference('R8KD2WQN')!
    const event = {
      flight_id: 'flt-fy204',
      gate_id: 'gate-a1',
      boarding_pass_id: pass.id,
      scanned_reference: pass.reference,
      event: 'boarded' as const,
      reason: null,
      staff_id: 'staff-demo',
    }
    s.appendEvent(event)
    expect(() => s.appendEvent(event)).toThrow(CheckInError)
    expect(s.listEvents('flt-fy204')).toHaveLength(1)
    expect(s.hasFinalEvent(pass.id)).toBe(true)
  })

  it('rejected events are unlimited', () => {
    const s = store()
    const event = {
      flight_id: 'flt-fy204',
      gate_id: 'gate-a1',
      boarding_pass_id: null,
      scanned_reference: 'NOPE',
      event: 'rejected' as const,
      reason: 'NOT_FOUND',
      staff_id: 'staff-demo',
    }
    s.appendEvent(event)
    s.appendEvent(event)
    expect(s.listEvents('flt-fy204')).toHaveLength(2)
  })

  it('updateCheckIn bumps updated_at', () => {
    const clock = new FixtureClock()
    const s = new CheckInStore()
    s.seedDemo(clock)
    const checkIn = s.listCheckInsByFlight('flt-fy204')[0]
    clock.set(new Date(clock.now().getTime() + 1000))
    s.updateCheckIn(checkIn.id, { declared_bags: 2 })
    const updated = s.getCheckIn(checkIn.id)!
    expect(updated.declared_bags).toBe(2)
    expect(updated.updated_at.getTime()).toBeGreaterThan(updated.created_at.getTime())
  })

  it('searches by flight, pnr and name, case-insensitively', () => {
    const s = store()
    expect(s.searchCheckIns({ pnr: 'ec204g' })).toHaveLength(1)
    expect(s.searchCheckIns({ name: 'kowalski' })).toHaveLength(1)
    expect(s.searchCheckIns({ flightId: 'flt-fy318' })).toHaveLength(5)
    expect(s.searchCheckIns({ pnr: 'ER204F' })).toHaveLength(0)
  })

  it('finds the active check-in of a booking passenger', () => {
    const s = store()
    expect(s.findActiveCheckInByBookingPassenger('bp-pl204a')?.status).toBe('checked_in')
    expect(s.findActiveCheckInByBookingPassenger('bp-er204f')).toBeNull()
  })

  it('hands out bag tag sequence numbers', () => {
    const s = store()
    expect(s.nextBagTagSeq()).toBe(1)
    expect(s.nextBagTagSeq()).toBe(2)
  })

  it('listBags leaves out soft deleted bags', () => {
    const s = store()
    const checkIn = s.listCheckInsByFlight('flt-fy204')[0]
    const bag = s.createBag({
      check_in_id: checkIn.id,
      weight_kg: 15,
      excess_kg: 0,
      rate_per_kg: 500,
      excess_fee: 0,
      weighed_by: 'staff-demo',
    })
    expect(s.listBags(checkIn.id)).toHaveLength(1)
    s.deleteBag(bag.id)
    expect(s.listBags(checkIn.id)).toHaveLength(0)
  })
})

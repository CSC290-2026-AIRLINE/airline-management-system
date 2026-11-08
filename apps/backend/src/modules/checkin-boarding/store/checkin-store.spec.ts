import { CheckInError } from '../errors'
import { FixtureClock } from '../providers/fixture-providers'
import { CheckInStore } from './checkin-store'
import type { CheckInRepository } from './checkin-repository'

const store = () => {
  const s = new CheckInStore()
  s.seedDemo(new FixtureClock())
  return s
}

/** The error a call throws, so its code can be checked. */
async function failureOf(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn()
  } catch (error) {
    return error
  }
  throw new Error('the call did not throw')
}

describe('CheckInStore', () => {
  it('seeds 13 checked-in passengers, two gates and two boarding rows', async () => {
    const s = store()
    expect(await s.listCheckInsByFlight('flt-fy204')).toHaveLength(8)
    expect(await s.listCheckInsByFlight('flt-fy318')).toHaveLength(5)
    expect((await s.flightBoarding('flt-fy204'))?.gate_id).toBe('gate-a1')
    expect((await s.flightBoarding('flt-fy318'))?.gate_id).toBe('gate-a2')
    expect((await s.listGates()).map((g) => g.code)).toEqual(['A1', 'A2'])
    expect(await s.passByReference('H3VN8PLA')).toBeTruthy()
    const dana = await s.passByReference('H3VN8PLA')
    expect((await s.getCheckIn(dana!.check_in_id))?.status).toBe('on_hold')
    expect(await s.listPasses()).toHaveLength(13)
  })

  it('seeds a document per check-in with only the last four characters', async () => {
    const s = store()
    const dana = (await s.passByReference('H3VN8PLA'))!
    const document = (await s.getDocumentByCheckIn(dana.check_in_id))!
    expect(document.number_last4).toBe('0000')
    expect(JSON.stringify(await s.listDocuments())).not.toContain('SEC000000')
  })

  it('appendEvent allows one final event per pass', async () => {
    const s = store()
    const pass = (await s.passByReference('R8KD2WQN'))!
    const event = {
      flight_id: 'flt-fy204',
      gate_id: 'gate-a1',
      boarding_pass_id: pass.id,
      scanned_reference: pass.reference,
      event: 'boarded' as const,
      reason: null,
      staff_id: 'staff-demo',
      occurred_at: new Date(),
    }
    await s.appendEvent(event)
    await expect(s.appendEvent(event)).rejects.toBeInstanceOf(CheckInError)
    expect(await s.listEvents('flt-fy204')).toHaveLength(1)
    expect(await s.hasFinalEvent(pass.id)).toBe(true)
  })

  it('rejected events are unlimited', async () => {
    const s = store()
    const event = {
      flight_id: 'flt-fy204',
      gate_id: 'gate-a1',
      boarding_pass_id: null,
      scanned_reference: 'NOPE',
      event: 'rejected' as const,
      reason: 'NOT_FOUND',
      staff_id: 'staff-demo',
      occurred_at: new Date(),
    }
    await s.appendEvent(event)
    await s.appendEvent(event)
    expect(await s.listEvents('flt-fy204')).toHaveLength(2)
  })

  it('createPass hands out one pass per check-in', async () => {
    const s = store()
    const checkIn = await s.createCheckIn({
      booking_passenger_id: 'bp-test-pass',
      passenger_id: 'pax-test-pass',
      flight_id: 'flt-fy204',
    })
    const first = await s.createPass({ check_in_id: checkIn.id, reference: 'AAAA1111', seat_code: '5A', boarding_group: 4 })
    const second = await s.createPass({ check_in_id: checkIn.id, reference: 'BBBB2222', seat_code: '5B', boarding_group: 4 })
    expect(second).toBe(first)
    expect(await s.passesForCheckIn(checkIn.id)).toHaveLength(1)
  })

  it('updateCheckIn bumps updated_at', async () => {
    const clock = new FixtureClock()
    const s = new CheckInStore()
    s.seedDemo(clock)
    const checkIn = (await s.listCheckInsByFlight('flt-fy204'))[0]
    clock.set(new Date(clock.now().getTime() + 1000))
    await s.updateCheckIn(checkIn.id, { declared_bags: 2 })
    const updated = (await s.getCheckIn(checkIn.id))!
    expect(updated.declared_bags).toBe(2)
    expect(updated.updated_at.getTime()).toBeGreaterThan(updated.created_at.getTime())
  })

  it('searches by flight; the pnr and the name belong to the booking, the service filters those', async () => {
    const s = store()
    expect(await s.searchCheckIns({ flightId: 'flt-fy318' })).toHaveLength(5)
    expect(await s.searchCheckIns({ flightId: 'flt-fy204' })).toHaveLength(8)
    expect(await s.searchCheckIns({})).toHaveLength(13)
  })

  it('finds the active check-in of a booking passenger', async () => {
    const s = store()
    expect((await s.findActiveCheckInByBookingPassenger('bp-pl224a'))?.status).toBe('checked_in')
    expect(await s.findActiveCheckInByBookingPassenger('bp-er224f')).toBeNull()
  })

  it('hands out bag tag sequence numbers', async () => {
    const s = store()
    expect(await s.nextBagTagSeq()).toBe(1)
    expect(await s.nextBagTagSeq()).toBe(2)
  })

  it('listBags leaves out soft deleted bags', async () => {
    const s = store()
    const checkIn = (await s.listCheckInsByFlight('flt-fy204'))[0]
    const bag = await s.createBag({
      check_in_id: checkIn.id,
      weight_kg: 15,
      excess_kg: 0,
      rate_per_kg: 500,
      excess_fee: 0,
      weighed_by: 'staff-demo',
    })
    expect(await s.listBags(checkIn.id)).toHaveLength(1)
    await s.deleteBag(bag.id)
    expect(await s.listBags(checkIn.id)).toHaveLength(0)
  })

  it('deleteBag refuses a tagged bag and a bag that is not weighed', async () => {
    const s = store()
    const checkIn = (await s.listCheckInsByFlight('flt-fy204'))[0]
    const tagged = await s.createBag({
      check_in_id: checkIn.id,
      weight_kg: 15,
      excess_kg: 0,
      rate_per_kg: 500,
      excess_fee: 0,
      weighed_by: 'staff-demo',
    })
    await s.updateBag(tagged.id, { tag_number: '0402000001', status: 'tagged' })
    expect(await failureOf(() => s.deleteBag(tagged.id))).toMatchObject({ code: 'INVALID_STATE', status: 409 })

    const offloaded = await s.createBag({
      check_in_id: checkIn.id,
      weight_kg: 15,
      excess_kg: 0,
      rate_per_kg: 500,
      excess_fee: 0,
      weighed_by: 'staff-demo',
    })
    await s.updateBag(offloaded.id, { status: 'offloaded' })
    expect(await failureOf(() => s.deleteBag(offloaded.id))).toMatchObject({ code: 'INVALID_STATE', status: 409 })
    expect(await s.listBags(checkIn.id)).toHaveLength(2)
  })

  it('seeds the police passenger in boarding group 1', async () => {
    const s = store()
    expect((await s.passByReference('V3LP9KWE'))!.boarding_group).toBe(1)
  })

  it('implements the repository asynchronously', async () => {
    const clock = new FixtureClock()
    const repo: CheckInRepository = new CheckInStore(clock)
    const created = await repo.createCheckIn({
      booking_passenger_id: 'bp-repo-test',
      passenger_id: 'pax-repo-test',
      flight_id: 'flt-fy204',
    })
    await expect(repo.getCheckIn(created.id)).resolves.toMatchObject({ id: created.id })
  })
})

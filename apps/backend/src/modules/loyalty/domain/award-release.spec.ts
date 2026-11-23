import { awardFlightStatus, awardOffer, checkRelease } from './award-release'

const now = new Date('2026-11-01T00:00:00Z')
const depAt = new Date('2026-11-10T00:00:00Z')
const base = { flightStatus: 'scheduled', depAt, now, cutoffHours: 72, seats: 6, milesCost: 8000, seatsTaken: 2 }

describe('checkRelease', () => {
  it('accepts a release on a flight still for sale', () => {
    expect(checkRelease(base)).toBeNull()
    expect(checkRelease({ ...base, flightStatus: 'delayed', seats: 2 })).toBeNull()
  })

  it.each<[Partial<typeof base>, string]>([
    [{ flightStatus: 'cancelled' }, 'flight_closed'],
    [{ flightStatus: 'departed' }, 'flight_closed'],
    [{ now: new Date('2026-11-10T00:00:00Z') }, 'flight_closed'],
    [{ now: new Date('2026-11-07T00:00:00Z') }, 'past_cutoff'],
    [{ seats: -1 }, 'bad_seats'],
    [{ seats: 1.5 }, 'bad_seats'],
    [{ milesCost: 0 }, 'bad_miles'],
    [{ seats: 1 }, 'below_taken'],
  ])('refuses %o as %s', (change, refusal) => {
    expect(checkRelease({ ...base, ...change })).toBe(refusal)
  })
})

describe('awardOffer', () => {
  const input = {
    milesCost: 8000,
    seats: { awardLimit: 5, awardHeld: 1, awardSold: 1 },
    party: { adults: 2, children: 1 },
    flightStatus: 'scheduled',
    depAt,
    now,
    cutoffHours: 72,
  }

  it('prices the seated party and says whether it fits', () => {
    expect(awardOffer(input)).toEqual({ milesCost: 8000, seatsLeft: 3, seatsNeeded: 3, milesTotal: 24000, open: true, available: true })
    expect(awardOffer({ ...input, party: { adults: 4, children: 0 } }).available).toBe(false)
  })

  it('is closed inside the cutoff or once the flight is not for sale', () => {
    expect(awardOffer({ ...input, now: new Date('2026-11-08T00:00:00Z') })).toMatchObject({ open: false, available: false })
    expect(awardOffer({ ...input, flightStatus: 'cancelled' })).toMatchObject({ open: false, available: false })
  })
})

describe('awardFlightStatus', () => {
  it('folds the in-air and finished statuses into departed', () => {
    expect(['scheduled', 'delayed', 'cancelled', 'holding', 'diverted', 'arrived'].map(awardFlightStatus)).toEqual([
      'scheduled',
      'delayed',
      'cancelled',
      'departed',
      'departed',
      'departed',
    ])
  })
})

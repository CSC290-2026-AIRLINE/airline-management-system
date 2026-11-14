import { chargeableKg, freightCharge, availableKg, exceedsTolerance, awbNumber } from './cargo-calc'

describe('chargeableKg', () => {
  it('picks volumetric weight when larger and rounds up to 0.5', () => {
    expect(chargeableKg(120, 1.2)).toBe(200.5)
  })

  it('picks actual weight when larger (already on a 0.5 boundary)', () => {
    expect(chargeableKg(300, 0.5)).toBe(300)
  })

  it('rounds up a fractional result to next 0.5', () => {
    expect(chargeableKg(100.1, 0)).toBe(100.5)
  })

  it('keeps an exact 0.5 boundary', () => {
    expect(chargeableKg(50.5, 0)).toBe(50.5)
  })
})

describe('freightCharge', () => {
  it('computes charge from chargeable weight and rate', () => {
    expect(freightCharge(200.5, 1.8, 0)).toBe(360.9)
  })

  it('returns the rate-based charge when above minimum', () => {
    expect(freightCharge(300, 1.8, 0)).toBe(540)
  })

  it('returns the minimum charge when rate-based is lower', () => {
    expect(freightCharge(10, 1.8, 100)).toBe(100)
  })
})

describe('availableKg', () => {
  const base = {
    holdLimitKg: 4000,
    sellableSeats: 180,
    reserveKgPerPax: 15,
    floorPercent: 50,
    committedKg: 0,
  }

  it('uses the floor when seats taken exceeds it not', () => {
    expect(availableKg({ ...base, seatsTaken: 10 })).toBe(2650)
  })

  it('uses seats taken when above the floor', () => {
    expect(availableKg({ ...base, seatsTaken: 150 })).toBe(1750)
  })

  it('subtracts committed cargo', () => {
    expect(availableKg({ ...base, seatsTaken: 150, committedKg: 500 })).toBe(1250)
  })
})

describe('exceedsTolerance', () => {
  it('returns false at the boundary', () => {
    expect(exceedsTolerance(110, 100, 10)).toBe(false)
  })

  it('returns true above the tolerance', () => {
    expect(exceedsTolerance(110.1, 100, 10)).toBe(true)
  })

  it('returns false well within tolerance', () => {
    expect(exceedsTolerance(100, 100, 10)).toBe(false)
  })
})

describe('awbNumber', () => {
  it('formats prefix-serial-check with mod-7 check digit', () => {
    expect(awbNumber('999', 1234567)).toBe('999-1234567-5')
  })

  it('pads short serials to 7 digits', () => {
    expect(awbNumber('999', 1)).toBe('999-0000001-1')
  })
})

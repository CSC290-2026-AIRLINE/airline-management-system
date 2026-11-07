import { boardingGroup, decideScan, type ScanContext } from './boarding'

const PASS = { flightId: 'flight-1', status: 'checked_in', alreadyFinal: false } as const

const ctx = (overrides: Partial<ScanContext> = {}): ScanContext => ({
  pass: { ...PASS },
  gateId: 'gate-a1',
  flightAtGate: 'flight-1',
  passFlightGateId: 'gate-a1',
  passFlightClosedAt: null,
  ...overrides,
})

describe('boardingGroup', () => {
  it('boarding groups', () => {
    expect(boardingGroup({ specialAssistance: ['WCHR'], cabin: 'first', tier: null })).toBe(1)
    expect(boardingGroup({ specialAssistance: [], cabin: 'first', tier: null })).toBe(2)
    expect(boardingGroup({ specialAssistance: [], cabin: 'business', tier: null })).toBe(2)
    expect(boardingGroup({ specialAssistance: [], cabin: 'economy', tier: 'top' })).toBe(2)
    expect(boardingGroup({ specialAssistance: [], cabin: 'premium_economy', tier: null })).toBe(3)
    expect(boardingGroup({ specialAssistance: [], cabin: 'economy', tier: 'other' })).toBe(3)
    expect(boardingGroup({ specialAssistance: [], cabin: 'economy', tier: null })).toBe(4)
  })
})

describe('decideScan', () => {
  it('decideScan order: not found, on hold, wrong gate, wrong flight, closed, already boarded, boarded', () => {
    expect(decideScan(ctx({ pass: null }))).toEqual({ event: 'rejected', reason: 'NOT_FOUND' })
    expect(decideScan(ctx({ pass: { ...PASS, status: 'on_hold' } }))).toEqual({ event: 'rejected', reason: 'ON_HOLD' })
    expect(decideScan(ctx({ pass: { ...PASS, status: 'denied' } }))).toEqual({ event: 'rejected', reason: 'ON_HOLD' })
    expect(decideScan(ctx({ pass: { ...PASS, flightId: 'flight-2' }, passFlightGateId: 'gate-a2' }))).toEqual({
      event: 'rejected',
      reason: 'WRONG_GATE',
    })
    expect(decideScan(ctx({ pass: { ...PASS, flightId: 'flight-2' }, passFlightGateId: null }))).toEqual({
      event: 'rejected',
      reason: 'WRONG_FLIGHT',
    })
    expect(decideScan(ctx({ passFlightClosedAt: new Date('2026-11-11T03:00:00.000Z') }))).toEqual({
      event: 'rejected',
      reason: 'GATE_CLOSED',
    })
    expect(decideScan(ctx({ pass: { ...PASS, alreadyFinal: true } }))).toEqual({
      event: 'rejected',
      reason: 'ALREADY_BOARDED',
    })
    expect(decideScan(ctx())).toEqual({ event: 'boarded', reason: null })
  })
})

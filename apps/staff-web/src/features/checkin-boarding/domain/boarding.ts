// Copy of apps/backend/src/modules/checkin-boarding/domain/boarding.ts. Keep in sync with the backend.
import type { Cabin, CheckInStatus, RejectReason } from '../api/types.ts'

export type BoardingGroup = 1 | 2 | 3 | 4

export function boardingGroup(p: { specialAssistance: string[]; cabin: Cabin; tier: 'top' | 'other' | null }): BoardingGroup {
  if (p.specialAssistance.length > 0) return 1
  if (p.cabin === 'first' || p.cabin === 'business' || p.tier === 'top') return 2
  if (p.cabin === 'premium_economy' || p.tier === 'other') return 3
  return 4
}

export interface ScanContext {
  pass: null | { flightId: string; status: CheckInStatus; alreadyFinal: boolean }
  gateId: string
  flightAtGate: string | null
  passFlightGateId: string | null
  passFlightClosedAt: Date | null
}

export function decideScan(ctx: ScanContext): { event: 'boarded' | 'rejected'; reason: RejectReason | null } {
  const pass = ctx.pass
  if (!pass) return { event: 'rejected', reason: 'NOT_FOUND' }
  if (pass.status === 'on_hold' || pass.status === 'denied') return { event: 'rejected', reason: 'ON_HOLD' }
  if (pass.flightId !== ctx.flightAtGate) {
    const wrongGate = ctx.passFlightGateId !== null && ctx.passFlightGateId !== ctx.gateId
    return { event: 'rejected', reason: wrongGate ? 'WRONG_GATE' : 'WRONG_FLIGHT' }
  }
  if (ctx.passFlightClosedAt) return { event: 'rejected', reason: 'GATE_CLOSED' }
  if (pass.alreadyFinal) return { event: 'rejected', reason: 'ALREADY_BOARDED' }
  return { event: 'boarded', reason: null }
}

import { randomUUID } from 'node:crypto'
import { Injectable } from '@nestjs/common'

export interface PayoutRequest {
  crewId: string
  /** Where the money goes. The fake provider needs one on file, like a real payout needs a bank account. */
  destination: string | null
  amountCents: number
  currency: string
}

export type PayoutResult = { ok: true; reference: string } | { ok: false; reason: string }

/**
 * Crew payouts. No real money moves in this iteration (payout.provider is 'fake'). The fake provider fails a payout
 * when the crew member has no payout contact on file, so the failed-payout path (Payment Exceptions, retry) can be
 * shown and tested; add the contact in feature 8 and retry.
 */
@Injectable()
export class FakePayoutProvider {
  send(request: PayoutRequest): PayoutResult {
    if (!request.destination?.trim()) {
      return { ok: false, reason: 'No payout destination on file for this crew member (add their contact in crew records, then retry)' }
    }
    if (request.amountCents <= 0) return { ok: false, reason: 'A payout must be above zero' }
    return { ok: true, reference: `fake_po_${randomUUID()}` }
  }
}

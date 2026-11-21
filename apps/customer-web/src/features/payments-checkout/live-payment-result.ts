import { formatAmount } from './receipt-copy'
import type { PaymentOutcome, PaymentResultDto } from './payment-result'
import type { PaymentStatusDto } from './types'

/**
 * Turns the payment the backend reports (`GET /api/payments/:id`) into a screen of the payment result page.
 *
 * The wording is the frames' own (see `api/mock-payment-results.ts`). Two things differ from the mock, because the API
 * does not carry them yet: there is no trip, passenger or booking line (those belong to the selling feature), and no
 * button points at a page that is not in this app, so no button is drawn dead.
 *
 * `state` on the result is only the nearest frame; the live page never reads it.
 */

const WARNING = 'bg-warning-soft text-warning'
const SUCCESS = 'bg-success-soft text-success-strong'
const DANGER = 'bg-danger-soft text-danger'
const MUTED = 'bg-secondary text-muted-foreground'

/** The parts of a result the live page never fills: no reference line, cards, notes or phone layout. */
function empty(): Pick<PaymentResultDto, 'reference' | 'blocks' | 'annotation' | 'note' | 'mobile'> {
  return { reference: null, blocks: [], annotation: null, note: null, mobile: null }
}

/** "21:15", the time the hold ends, or null when it has already ended. */
function holdEnds(expiresAt: string): string | null {
  const at = new Date(expiresAt)
  if (Number.isNaN(at.getTime()) || at.getTime() <= Date.now()) return null
  return at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

/**
 * Whether the payment is still being confirmed, so the page should ask again.
 *
 * The card is held when Stripe says so, which reaches us by webhook a moment after the customer is sent back. Until
 * then the payment is still `created`, and with `outcome=paid` that only means the webhook has not arrived yet.
 */
export function isStillConfirming(payment: PaymentStatusDto, outcome: PaymentOutcome | undefined): boolean {
  if (payment.state !== 'authorised') return false
  return payment.status === 'authorised' || outcome === 'paid'
}

export function toPaymentResult(payment: PaymentStatusDto, outcome: PaymentOutcome | undefined): PaymentResultDto {
  const card = `${formatAmount(payment.card_amount)} ${payment.currency}`
  const receipt = payment.receipt_id
    ? [{ label: 'View receipt', link: { to: '/receipts/$receiptId' as const, receiptId: payment.receipt_id }, variant: 'primary' as const }]
    : []

  switch (payment.state) {
    case 'captured': {
      const charged = payment.card_amount > 0 ? `${card} was charged to your card.` : 'No card was charged.'
      const voucher =
        payment.voucher_amount > 0 ? ` ${formatAmount(payment.voucher_amount)} ${payment.currency} was paid with a voucher.` : ''
      const issued = payment.receipt_id ? ' A receipt has been issued.' : ' Your receipt will be ready in a moment.'
      return {
        ...empty(),
        state: 'paid',
        badge: 'Captured',
        badge_class: SUCCESS,
        title: 'Your payment is complete',
        body: `${charged}${voucher}${issued}`,
        actions: receipt,
      }
    }

    case 'refunded':
      return {
        ...empty(),
        state: 'paid',
        badge: 'Refunded',
        badge_class: MUTED,
        title: 'This payment was refunded',
        body: 'The money was returned to you. The receipt and its credit note are in your payments.',
        actions: [{ label: 'View my payments', link: { to: '/receipts' }, variant: 'outline' }],
      }

    case 'confirming':
      return {
        ...empty(),
        state: 'capture_stalled',
        badge: 'Confirming payment',
        badge_class: WARNING,
        title: 'We are completing your payment',
        body: `We are still completing the card charge for ${card}; it is taking longer than usual. You do not need to pay again. We keep retrying and will email you when it finishes.`,
        actions: [{ label: 'View my payments', link: { to: '/receipts' }, variant: 'outline' }],
      }

    case 'failed':
      return {
        ...empty(),
        state: 'card_declined',
        badge: 'Failed',
        badge_class: DANGER,
        title: 'Your card was declined',
        body: 'Nothing was charged. Go back to your booking and try another card while your hold lasts.',
        actions: [],
      }

    case 'expired':
      return {
        ...empty(),
        state: 'hold_expired',
        badge: 'Expired',
        badge_class: WARNING,
        title: 'Your hold ran out',
        body: 'The hold ended before payment finished. Any card authorisation was voided and you were not charged. Start again to pay.',
        actions: [],
      }

    case 'authorised': {
      if (isStillConfirming(payment, outcome)) {
        return {
          ...empty(),
          state: 'processing',
          badge: payment.status === 'authorised' ? 'Authorised' : 'Confirming',
          badge_class: WARNING,
          title: 'Confirming your payment…',
          body:
            payment.status === 'authorised'
              ? 'Stripe has authorised your card. We are confirming your payment now. This page updates by itself; please do not pay again or close the tab.'
              : 'We are waiting for Stripe to confirm your payment. This page updates by itself; please do not pay again or close the tab.',
          actions: [],
          progress: true,
        }
      }
      // Still `created`, and the customer did not come back from a successful payment.
      const ends = holdEnds(payment.expires_at)
      return {
        ...empty(),
        state: 'card_declined',
        badge: 'Not paid',
        badge_class: WARNING,
        title: 'Your payment is not finished',
        body: `Nothing was charged.${outcome === 'cancelled' ? ' You left the Stripe page before paying.' : ''}${
          ends ? ` Your hold lasts until ${ends}; go back to your booking to pay.` : ' Your hold has ended.'
        }`,
        actions: [],
      }
    }

    default: {
      const unreachable: never = payment.state
      return unreachable
    }
  }
}

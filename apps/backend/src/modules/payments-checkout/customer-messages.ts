import type { Prisma } from '@backend/db/generated/prisma/client'

/**
 * Customer messages through Feature 13: one `inbound_event` row with source '5', written in the same transaction as the
 * money movement it reports, like the finance journal. F13's sender picks unprocessed rows up, finds the customer by
 * `payload.customer_id` (their own contact and preferences, so a voucher code goes only to them) and fills the templates
 * from the payload. `source_event_id` is `<type>:<id>`, so repeating a movement never sends a second message.
 */
export type CustomerMessageType = 'payment_received' | 'refund_issued' | 'refund_failed' | 'voucher_issued'

export interface CustomerMessage {
  type: CustomerMessageType
  /** The payment, refund or voucher id. */
  sourceId: string
  customerId: string | null
  /** Simulation-clock time of the movement. */
  at: Date
  /** Template placeholders: reference, amount, document_number, voucher_code, expires_on. */
  placeholders: Record<string, string>
}

/** `THB 1,234.50`. */
export function messageAmount(amount: number, currency: string): string {
  return `${currency} ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** `2027-05-24`, in UTC. */
export function messageDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** The receipt number `issueReceipt` gives a payment (an invoice for cargo). */
export function receiptNumberOf(payment: { id: string; source_feature: number }): string {
  return `${payment.source_feature === 17 ? 'INV' : 'RCPT'}-${payment.id.slice(-6).toUpperCase()}`
}

/** What the customer knows the purchase by: the booking or cargo reference, else the purchase reference. */
export async function purchaseReferenceOf(tx: Prisma.TransactionClient, paymentId: string): Promise<string> {
  const payment = await tx.payment.findUnique({
    where: { id: paymentId },
    select: {
      purchase_ref: true,
      booking: { select: { booking_reference: true } },
      cargo_booking_payment_cargo_booking_idTocargo_booking: { select: { booking_ref: true } },
    },
  })
  return (
    payment?.booking?.booking_reference ??
    payment?.cargo_booking_payment_cargo_booking_idTocargo_booking?.booking_ref ??
    payment?.purchase_ref ??
    ''
  )
}

/** Stores the message for F13. A message without a customer has no one to go to, so nothing is stored. */
export async function queueCustomerMessage(tx: Prisma.TransactionClient, message: CustomerMessage): Promise<void> {
  if (!message.customerId) return
  await tx.inbound_event.createMany({
    data: [
      {
        source: '5',
        source_event_id: `${message.type}:${message.sourceId}`,
        event_type: message.type,
        payload: { customer_id: message.customerId, ...message.placeholders },
        received_at: message.at,
      },
    ],
    skipDuplicates: true,
  })
}

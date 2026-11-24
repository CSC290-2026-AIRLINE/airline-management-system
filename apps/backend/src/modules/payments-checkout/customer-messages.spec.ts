import type { Prisma } from '@backend/db/generated/prisma/client'
import { messageAmount, messageDate, purchaseReferenceOf, queueCustomerMessage, receiptNumberOf } from './customer-messages'

describe('customer messages (Feature 13)', () => {
  const tx = { inbound_event: { createMany: jest.fn() }, payment: { findUnique: jest.fn() } }
  const client = tx as unknown as Prisma.TransactionClient
  const AT = new Date('2026-11-24T09:30:00Z')

  beforeEach(() => jest.resetAllMocks())

  it('stores one source 5 event per movement, keyed so a repeat is skipped', async () => {
    await queueCustomerMessage(client, {
      type: 'refund_issued',
      sourceId: 'refund-1',
      customerId: 'cust-1',
      at: AT,
      placeholders: { reference: 'ABC123', amount: 'THB 1,200.00' },
    })

    expect(tx.inbound_event.createMany).toHaveBeenCalledWith({
      data: [
        {
          source: '5',
          source_event_id: 'refund_issued:refund-1',
          event_type: 'refund_issued',
          payload: { customer_id: 'cust-1', reference: 'ABC123', amount: 'THB 1,200.00' },
          received_at: AT,
        },
      ],
      skipDuplicates: true,
    })
  })

  it('stores nothing for a payment without a customer', async () => {
    await queueCustomerMessage(client, { type: 'payment_received', sourceId: 'p-1', customerId: null, at: AT, placeholders: {} })
    expect(tx.inbound_event.createMany).not.toHaveBeenCalled()
  })

  it('formats amounts, dates and receipt numbers as the templates show them', () => {
    expect(messageAmount(1234.5, 'THB')).toBe('THB 1,234.50')
    expect(messageDate(AT)).toBe('2026-11-24')
    expect(receiptNumberOf({ id: '00000000-0000-0000-0000-00000abcdef1', source_feature: 3 })).toBe('RCPT-BCDEF1')
    expect(receiptNumberOf({ id: '00000000-0000-0000-0000-00000abcdef1', source_feature: 17 })).toBe('INV-BCDEF1')
  })

  it('names the purchase by its booking, then its cargo booking, then its purchase reference', async () => {
    tx.payment.findUnique.mockResolvedValueOnce({
      purchase_ref: 'booking:b-1',
      booking: { booking_reference: 'PNR123' },
      cargo_booking_payment_cargo_booking_idTocargo_booking: null,
    })
    tx.payment.findUnique.mockResolvedValueOnce({
      purchase_ref: 'cargo:c-1',
      booking: null,
      cargo_booking_payment_cargo_booking_idTocargo_booking: { booking_ref: 'CG-0001' },
    })
    tx.payment.findUnique.mockResolvedValueOnce({
      purchase_ref: 'sale:S-9',
      booking: null,
      cargo_booking_payment_cargo_booking_idTocargo_booking: null,
    })

    expect(await purchaseReferenceOf(client, 'p-1')).toBe('PNR123')
    expect(await purchaseReferenceOf(client, 'p-2')).toBe('CG-0001')
    expect(await purchaseReferenceOf(client, 'p-3')).toBe('sale:S-9')
  })
})

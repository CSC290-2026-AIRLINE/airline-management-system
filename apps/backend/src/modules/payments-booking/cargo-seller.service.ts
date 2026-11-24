import { Injectable, Logger } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { SimulationClock } from '@backend/modules/admin-console/simulation-clock'
import { PaymentsCheckoutService } from '@backend/modules/payments-checkout/payments-checkout.service'
import type { PaymentRecord } from '@backend/modules/payments-checkout/payment.types'

/** The airline's 3-digit number on every Air Waybill; Feature 3's tickets use the same one. */
const AIRLINE_NUMBER = '999'

/**
 * The seller's side of a cargo payment (source feature 17), which Feature 5 plays for Feature 17 from the cargo tables:
 *
 * - **Confirm.** Once the card is authorised, the booking moves from `held` to `booked` (a `confirmed` shipment event),
 *   if it is still held and its 15-minute hold has not ended. Anything else is a refusal, and 5a voids the authorisation.
 * - **Capture.** The Air Waybill is issued at capture: `payment_id`, `awb_number` and `awb_issued_at` are set together,
 *   once, and never change. If that fails the payment stays captured and a later pass issues it.
 * - **Release.** A payment that expired unpaid ends its hold early with an `expired` event.
 *
 * Feature 17 owns everything after this (acceptance, loading, cancelling); it asks `CargoRefundAdapter` when money goes
 * back. A second payment (`cargo_reweigh:<id>`) never sets the booking's `payment_id` or issues a second waybill.
 */
@Injectable()
export class CargoSellerService {
  private readonly logger = new Logger(CargoSellerService.name)

  constructor(
    private readonly db: DbService,
    private readonly clock: SimulationClock,
    private readonly payments: PaymentsCheckoutService,
  ) {
    this.payments.registerSellerConfirmation(17, (payment) => this.confirm(payment))
    this.payments.registerSellerCaptured(17, (payment) => this.issueAirWaybill(payment))
    this.payments.registerSellerRelease(17, (payment) => this.release(payment))
    this.payments.registerMaintenanceTask(() => this.issueMissingAirWaybills())
  }

  /** `held` to `booked`, inside one transaction with the booking row locked. A repeat of a yes is a yes. */
  async confirm(payment: PaymentRecord): Promise<boolean> {
    const cargoBookingId = payment.cargo_booking_id
    if (!cargoBookingId) return false
    const now = this.clock.now()
    return this.db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ flight_id: string; hold_expires_at: Date }[]>`
        SELECT flight_id, hold_expires_at FROM cargo_booking WHERE id = ${cargoBookingId}::uuid FOR UPDATE`
      const booking = rows[0]
      if (!booking) return false
      const latest = await tx.cargo_shipment_event.findFirst({
        where: { cargo_booking_id: cargoBookingId },
        orderBy: { seq: 'desc' },
        select: { id: true, status_after: true },
      })
      if (latest?.status_after === 'booked') return true
      if (latest?.status_after !== 'held' || booking.hold_expires_at.getTime() <= now.getTime()) return false
      await tx.cargo_shipment_event.create({
        data: {
          cargo_booking_id: cargoBookingId,
          previous_event_id: latest.id,
          status_before: 'held',
          event_type: 'confirmed',
          status_after: 'booked',
          flight_id: booking.flight_id,
          actor_type: 'system',
          occurred_at: now,
        },
      })
      return true
    })
  }

  /** Issues the Air Waybill for a captured booking payment. Safe to repeat: a booking that has one is left alone. */
  async issueAirWaybill(payment: PaymentRecord): Promise<void> {
    const cargoBookingId = payment.cargo_booking_id
    // Only the booking's own payment carries the waybill; a re-weigh charge is a second payment on the same booking.
    if (!cargoBookingId || payment.purchase_ref !== `cargo_booking:${cargoBookingId}` || payment.status !== 'captured') return
    await this.issue(payment.id, cargoBookingId, payment.captured_at ?? this.clock.now())
  }

  private async issue(paymentId: string, cargoBookingId: string, issuedAt: Date): Promise<void> {
    await this.db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ awb_number: string | null }[]>`
        SELECT awb_number FROM cargo_booking WHERE id = ${cargoBookingId}::uuid FOR UPDATE`
      if (!rows[0] || rows[0].awb_number) return
      const [{ serial }] = await tx.$queryRaw<{ serial: bigint }[]>`SELECT nextval('air_waybill_serial_seq') AS serial`
      const number = Number(serial)
      // The airline's number, a 7-digit serial and a check digit equal to the serial modulo 7.
      const awb = `${AIRLINE_NUMBER}${String(number).padStart(7, '0')}${number % 7}`
      await tx.cargo_booking.update({
        where: { id: cargoBookingId },
        data: { payment_id: paymentId, awb_number: awb, awb_issued_at: issuedAt, updated_at: this.clock.now() },
      })
    })
  }

  /** The maintenance pass: a captured cargo payment whose waybill was not issued (the app stopped between) gets it now. */
  async issueMissingAirWaybills(): Promise<number> {
    const missing = await this.db.payment.findMany({
      where: {
        source_feature: 17,
        status: 'captured',
        purchase_ref: { startsWith: 'cargo_booking:' },
        cargo_booking_payment_cargo_booking_idTocargo_booking: { awb_number: null },
      },
      take: 25,
      select: { id: true, cargo_booking_id: true, captured_at: true },
    })
    for (const row of missing) {
      if (row.cargo_booking_id) await this.issue(row.id, row.cargo_booking_id, row.captured_at ?? this.clock.now())
    }
    if (missing.length > 0) this.logger.log(`Issued ${missing.length} Air Waybill(s) that were left over`)
    return missing.length
  }

  /** A payment that expired unpaid: the hold ends early. A booking that has moved on is left alone. */
  async release(payment: PaymentRecord): Promise<void> {
    const cargoBookingId = payment.cargo_booking_id
    if (!cargoBookingId) return
    const now = this.clock.now()
    await this.db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        { flight_id: string }[]
      >`SELECT flight_id FROM cargo_booking WHERE id = ${cargoBookingId}::uuid FOR UPDATE`
      const latest = await tx.cargo_shipment_event.findFirst({
        where: { cargo_booking_id: cargoBookingId },
        orderBy: { seq: 'desc' },
        select: { id: true, status_after: true },
      })
      if (!rows[0] || latest?.status_after !== 'held') return
      await tx.cargo_shipment_event.create({
        data: {
          cargo_booking_id: cargoBookingId,
          previous_event_id: latest.id,
          status_before: 'held',
          event_type: 'expired',
          status_after: 'expired',
          flight_id: rows[0].flight_id,
          actor_type: 'system',
          occurred_at: now,
        },
      })
    })
  }
}

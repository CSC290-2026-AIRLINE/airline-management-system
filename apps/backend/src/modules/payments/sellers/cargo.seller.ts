import { Injectable, Logger } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { SimulationClock } from '@backend/modules/admin-console/simulation-clock'
import { toCents } from '../money'
import type { CargoSeller, ConfirmAnswer, Purchase } from './seller'

/**
 * Feature 17's side of a cargo payment, as a read-only stub until 17 ships its cargo service. 17 owns the rate, the
 * 15-minute hold, the statuses and the Air Waybill; this stub only reads the booking and answers confirm from its hold.
 * Swap the `CARGO_SELLER` provider in payments.module.ts for 17's implementation when it lands.
 */
@Injectable()
export class CargoSellerStub implements CargoSeller {
  readonly sourceFeature = 17 as const
  private readonly logger = new Logger(CargoSellerStub.name)

  constructor(
    private readonly db: DbService,
    private readonly clock: SimulationClock,
  ) {}

  async getCargoBooking(id: string): Promise<Purchase | null> {
    const cargo = await this.db.cargo_booking.findUnique({
      where: { id },
      select: {
        id: true,
        booking_ref: true,
        customer_id: true,
        quoted_charge: true,
        quoted_chargeable_kg: true,
        currency: true,
        hold_expires_at: true,
        payment_id: true,
      },
    })
    if (!cargo) return null
    return {
      sourceFeature: 17,
      purchaseRef: `cargo_booking:${cargo.id}`,
      customerId: cargo.customer_id,
      bookingId: null,
      cargoBookingId: cargo.id,
      payable: cargo.payment_id === null,
      expiresAt: cargo.hold_expires_at,
      currency: cargo.currency,
      lines: [
        {
          lineType: 'cargo_freight',
          sourceRef: `cargo_booking:${cargo.id}`,
          description: `Air freight ${cargo.booking_ref} · ${cargo.quoted_chargeable_kg.toString()} kg chargeable`,
          amountCents: toCents(cargo.quoted_charge),
        },
      ],
      milesBooking: false,
      label: cargo.booking_ref,
      cancelPath: `/cargo/${cargo.id}/pay`,
    }
  }

  async confirm(purchaseRef: string): Promise<ConfirmAnswer> {
    const cargo = await this.db.cargo_booking.findUnique({
      where: { id: purchaseRef.replace(/^cargo_booking:/, '') },
      select: { hold_expires_at: true, payment_id: true },
    })
    if (!cargo) return { ok: false, code: 'CARGO_NOT_PAYABLE', message: 'The cargo booking no longer exists' }
    if (cargo.payment_id) return { ok: true }
    if (cargo.hold_expires_at <= this.clock.now()) return { ok: false, code: 'HOLD_EXPIRED', message: 'The cargo space hold has ended' }
    return { ok: true }
  }

  release(purchaseRef: string): Promise<void> {
    this.logger.log(`release(${purchaseRef}) — no-op until feature 17 provides it`)
    return Promise.resolve()
  }

  onCaptured(purchaseRef: string): Promise<void> {
    this.logger.log(`payment.captured for ${purchaseRef} — feature 17 sets payment_id and issues the Air Waybill`)
    return Promise.resolve()
  }
}

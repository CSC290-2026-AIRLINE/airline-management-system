import '../../payments-checkout/demo/fake-provider-env'
import 'reflect-metadata'
import assert from 'node:assert/strict'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import { AppModule } from '@backend/app.module'
import { DbService } from '@backend/db/db.service'
import { createTestBooking } from '@backend/modules/booking-pnr/testing/create-test-booking'
import { ScreenAccessGuard } from '@backend/modules/payments-checkout/guards/screen-access.guard'
import { IssueCompensationDto } from '@backend/modules/payments-refunds/dto/refund-action.dto'
import { PaymentsRefundsService } from '@backend/modules/payments-refunds/payments-refunds.service'
import { OnboardPaymentsAdapter } from '@backend/modules/payments-refunds/onboard-payments.adapter'
import { LoyaltyAwardService } from '@backend/modules/loyalty/loyalty-award.service'
import { BookingChargeAdapter } from '@backend/modules/payments-checkout/booking-charge.adapter'
import { CargoRefundAdapter } from '@backend/modules/payments-refunds/cargo-refund.adapter'
import { CargoSellerService } from '../cargo-seller.service'
import { BookingRefundAdapter } from '@backend/modules/payments-refunds/booking-refund.adapter'

/**
 * A smoke test of a flight booking's checkout (Feature 3 to Feature 5) against the real database, through the real routes:
 * `POST /checkout`, Feature 3's `confirmBooking` as the seller's answer, a voucher, and Feature 3's refund port on a cancel.
 *
 * RUN IT ON A COPY OF THE DATABASE, never the one you work in. It creates bookings, flights' seat counts move, and the
 * finance journal and the audit log are append-only, so its rows cannot be deleted.
 *
 * From `apps/backend`, after `npm run build`, with `DATABASE_URL` pointing at the copy:
 *   node -r tsconfig-paths/register dist/src/modules/payments-booking/demo/http-smoke.js
 */
async function main(): Promise<void> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(JwtService)
    .useValue({ verifyAsync: (token: string) => Promise.resolve({ sub: token, email: 'test@example.com' }) })
    .overrideGuard(ScreenAccessGuard)
    .useValue({ canActivate: () => true })
    .compile()
  const app = moduleRef.createNestApplication({ logger: ['error'] })
  app.setGlobalPrefix('/api')
  await app.init()
  await app.listen(0)
  const base = `${await app.getUrl()}/api`.replace('[::1]', 'localhost')
  const db = app.get(DbService)
  const refundPort = app.get(BookingRefundAdapter)

  const [me, other] = await db.customer.findMany({
    where: { deleted_at: null },
    orderBy: { created_at: 'asc' },
    take: 2,
  })
  const stock = await db.seat_inventory.findFirstOrThrow({
    where: { cabin: 'economy', flight: { status: 'scheduled', dep_at: { gt: new Date() } } },
    orderBy: { flight: { dep_at: 'asc' } },
    select: { flight_id: true },
  })
  const flight = { id: stock.flight_id }
  const step = (text: string) => console.log(`  ok  ${text}`)
  const call = async (user: string, path: string, body: unknown, headers: Record<string, string> = {}) => {
    const res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${user}`, 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    })
    const text = await res.text()
    return { status: res.status, body: text ? JSON.parse(text) : null }
  }
  // A passenger holds one coupon per flight, so each booking gets a passenger of its own.
  const get = async (user: string, path: string) => {
    const res = await fetch(`${base}${path}`, { headers: { authorization: `Bearer ${user}` } })
    const text = await res.text()
    return { status: res.status, body: text ? JSON.parse(text) : null }
  }
  const held = async (customerId: string, holdMinutes = 15, onFlight = flight.id) => {
    const passenger = await db.passenger.create({
      data: { first_name: 'Smoke', last_name: `Test${Math.random().toString(36).slice(2, 7)}` },
    })
    return createTestBooking(db, {
      customerId,
      passengers: [{ passengerId: passenger.id }],
      segments: [{ flightId: onFlight, cabin: 'economy' }],
      status: 'held',
      holdMinutes,
    })
  }
  const tag = Math.random().toString(36).slice(2, 8)

  try {
    /* 1. The happy path: pay, Feature 3 confirms, the payment is captured, the booking is confirmed. */
    const a = await held(me.id)
    const paid = await call(me.user_id, '/checkout', { booking_reference: a.reference }, { 'idempotency-key': `bk-${tag}-a` })
    assert.equal(paid.status, 200, JSON.stringify(paid.body))
    assert.equal(paid.body.status, 'captured')
    const payment = await db.payment.findUniqueOrThrow({
      where: { id: paid.body.payment_id },
      include: { receipt: true, payment_line_payment_line_payment_idTopayment: true },
    })
    assert.equal(payment.source_feature, 3)
    assert.equal(payment.purchase_ref, `booking:${a.bookingId}`)
    assert.equal(Number(payment.amount_total), 148.5)
    assert.equal(payment.payment_line_payment_line_payment_idTopayment[0].line_type, 'fare')
    assert.equal(payment.receipt.length, 1)
    assert.equal((await db.booking.findUniqueOrThrow({ where: { id: a.bookingId } })).status, 'confirmed')
    assert.equal(await db.finance_posting.count({ where: { posting_key: `payment_captured:${payment.id}` } }), 1)
    step('POST /checkout: the booking is confirmed by Feature 3, the payment captured with a receipt and one journal row')

    const replay = await call(me.user_id, '/checkout', { booking_reference: a.reference }, { 'idempotency-key': `bk-${tag}-a` })
    assert.equal(replay.body.payment_id, paid.body.payment_id)
    step('the same Idempotency-Key answers with the same payment, though the booking is no longer held')

    /* The spec's names for the customer's own reads. */
    const mine = await get(me.user_id, '/customers/me/payments')
    assert.equal(mine.status, 200)
    assert.ok(mine.body.some((row: { id: string }) => row.id === payment.id))
    const receipt = await get(me.user_id, `/payments/${payment.id}/receipt`)
    assert.equal(receipt.status, 200, JSON.stringify(receipt.body))
    assert.equal(receipt.body.lines.length, 1)
    assert.equal((await get(other.user_id, `/payments/${payment.id}/receipt`)).status, 404)
    step('GET /customers/me/payments and GET /payments/:id/receipt answer the owner, and 404 for anyone else')

    /* A booking an agent made: the agent starts the checkout, the customer is the payer. */
    const staff0 = await db.staff.findFirstOrThrow({ where: { deleted_at: null }, select: { user_id: true } })
    const agentMade = await held(me.id)
    const viaStaff = await call(
      staff0.user_id,
      '/staff/checkout',
      { booking_reference: agentMade.reference },
      { 'idempotency-key': `bk-${tag}-s` },
    )
    assert.equal(viaStaff.status, 200, JSON.stringify(viaStaff.body))
    const staffPayment = await db.payment.findUniqueOrThrow({ where: { id: viaStaff.body.payment_id } })
    assert.equal(staffPayment.payer_customer_id, me.id)
    assert.equal(viaStaff.body.status, 'captured')
    step('POST /staff/checkout: an agent pays for a customer’s held booking, and the customer is the payer')

    /* 2. Refusals at the door. */
    const b = await held(me.id)
    const noKey = await call(me.user_id, '/checkout', { booking_reference: b.reference })
    assert.equal(noKey.status, 422)
    assert.equal(noKey.body.error.code, 'IDEMPOTENCY_KEY_REQUIRED')
    const theirs = await call(other.user_id, '/checkout', { booking_reference: b.reference }, { 'idempotency-key': `bk-${tag}-x` })
    assert.equal(theirs.status, 404)
    assert.equal(theirs.body.error.code, 'BOOKING_NOT_FOUND')
    const closed = await call(me.user_id, '/checkout', { booking_reference: a.reference }, { 'idempotency-key': `bk-${tag}-y` })
    assert.equal(closed.status, 409)
    assert.equal(closed.body.error.code, 'PAYMENT_NOT_PAYABLE')
    const short = await held(me.id, 2)
    const tooShort = await call(me.user_id, '/checkout', { booking_reference: short.reference }, { 'idempotency-key': `bk-${tag}-z` })
    assert.equal(tooShort.status, 409)
    assert.equal(tooShort.body.error.code, 'HOLD_TOO_SHORT')
    step('no key -> 422 IDEMPOTENCY_KEY_REQUIRED; someone else’s booking -> 404; a confirmed one -> 409; a 2-minute hold -> HOLD_TOO_SHORT')

    /* 3. The seller refuses (the flight is no longer for sale): the authorisation is voided and nobody is charged. */
    await db.flight.update({ where: { id: flight.id }, data: { status: 'cancelled' } })
    const refused = await call(me.user_id, '/checkout', { booking_reference: b.reference }, { 'idempotency-key': `bk-${tag}-b` })
    await db.flight.update({ where: { id: flight.id }, data: { status: 'scheduled' } })
    assert.equal(refused.status, 200, JSON.stringify(refused.body))
    assert.equal(refused.body.status, 'voided')
    assert.equal(await db.refund.count({ where: { payment_id: refused.body.payment_id } }), 0)
    assert.equal(await db.finance_posting.count({ where: { source_id: refused.body.payment_id } }), 0)
    step('Feature 3 refuses the confirm: the payment is voided, no refund, no journal row')

    /* 4. A voucher pays part, and is used up when the payment is captured. */
    const c = await held(me.id)
    const staff = await db.staff.findFirstOrThrow({ where: { deleted_at: null }, select: { user_id: true } })
    const granted = await app.get(PaymentsRefundsService).issueCompensation(
      staff.user_id,
      Object.assign(new IssueCompensationDto(), {
        booking_reference: a.reference,
        kind: 'voucher',
        amount: 40,
        reason: 'Smoke test goodwill',
      }),
    )
    const voucher = await db.compensation_voucher.findFirstOrThrow({
      where: { customer_id: me.id, status: 'active' },
      orderBy: { issued_at: 'desc' },
    })
    const withVoucher = await call(
      me.user_id,
      '/checkout',
      { booking_reference: c.reference, voucher_code: granted.reference },
      { 'idempotency-key': `bk-${tag}-c` },
    )
    assert.equal(withVoucher.status, 200, JSON.stringify(withVoucher.body))
    const p = await db.payment.findUniqueOrThrow({ where: { id: withVoucher.body.payment_id } })
    assert.equal(Number(p.voucher_amount), 40)
    assert.equal(Number(p.card_amount), 108.5)
    assert.equal((await db.compensation_voucher.findUniqueOrThrow({ where: { id: voucher.id } })).status, 'redeemed')
    assert.equal(await db.finance_posting.count({ where: { posting_key: `voucher_redeemed:${voucher.id}` } }), 1)
    step('a voucher of 40 pays part (card 108.50), is redeemed when the payment is captured, and posts a no-cash redemption')

    /* A mixed payment is refunded pro rata: the voucher's share comes back as a new voucher, the rest to the card. */
    await refundPort.record({ bookingId: c.bookingId, amount: 100, currency: 'USD', reason: 'customer_cancel' })
    const mixed = await db.refund.findFirstOrThrow({ where: { payment_id: p.id } })
    assert.equal(Number(mixed.amount), 100)
    assert.equal(Number(mixed.voucher_amount), 26.94)
    assert.equal(await db.compensation_voucher.count({ where: { refund_id: mixed.id } }), 1)
    step('a mixed payment is refunded pro rata: 26.94 returns as a new voucher, 73.06 to the card')

    /* 5. Feature 3 cancels the confirmed booking: its refund port makes one refund, once, with the fee withheld. */
    await refundPort.record({ bookingId: a.bookingId, amount: 100, currency: 'USD', reason: 'customer_cancel' })
    await refundPort.record({ bookingId: a.bookingId, amount: 100, currency: 'USD', reason: 'customer_cancel' })
    const refunds = await db.refund.findMany({
      where: { payment_id: payment.id, reason: 'customer_cancel' },
      include: { refund_line: true },
    })
    assert.equal(refunds.length, 1)
    assert.equal(refunds[0].source_key, `customer_cancel:${a.bookingId}`)
    assert.equal(refunds[0].reason, 'customer_cancel')
    assert.equal(Number(refunds[0].amount), 100)
    assert.equal(Number(refunds[0].fee_withheld), 48.5)
    assert.equal(refunds[0].refund_line.length, 1)
    assert.equal(refunds[0].status, 'succeeded')
    const line = await db.payment_line.findFirstOrThrow({ where: { payment_id: payment.id } })
    assert.equal(Number(line.refunded_amount), 100)
    assert.equal(await db.finance_posting.count({ where: { posting_key: `refund_succeeded:${refunds[0].id}` } }), 1)
    step('a cancel (twice): one customer_cancel refund of 100 with 48.50 fee withheld, credit note, line counter and journal row')

    /* 6. A cancel of a booking whose payment is only authorised voids it: nothing was charged. */
    const d = await held(me.id)
    const stalled = await db.payment.create({
      data: {
        source_feature: 3,
        purchase_ref: `booking:${d.bookingId}`,
        booking_id: d.bookingId,
        payer_customer_id: me.id,
        idempotency_key: `bk-${tag}-d`,
        provider: 'fake',
        status: 'authorised',
        currency: 'USD',
        amount_total: 148.5,
        card_amount: 148.5,
        started_at: new Date(),
        expires_at: new Date(Date.now() + 900_000),
        authorised_at: new Date(),
        updated_at: new Date(),
      },
    })
    await refundPort.record({ bookingId: d.bookingId, amount: 148.5, currency: 'USD', reason: 'customer_cancel' })
    assert.equal((await db.payment.findUniqueOrThrow({ where: { id: stalled.id } })).status, 'voided')
    assert.equal(await db.refund.count({ where: { payment_id: stalled.id } }), 0)
    step('a cancel while only authorised: the payment is voided, nothing is refunded')

    /* 6b. Feature 3's checkout port: a paid seat is charged inside its own transaction, with a line, a receipt and a journal row. */
    const charger = app.get(BookingChargeAdapter)
    const couponOfA = await db.booking_coupon.findFirstOrThrow({ where: { booking_id: a.bookingId }, select: { id: true } })
    const seatRow = await db.seat_assignment.create({
      data: {
        booking_coupon_id: couponOfA.id,
        flight_id: flight.id,
        seat_code: '12A',
        status: 'held',
        fee_amount: 25,
        hold_expires_at: new Date(Date.now() + 600_000),
      },
    })
    const seatRef = `seat_assignment:${seatRow.id}`
    const seat = await charger.charge({
      bookingId: a.bookingId,
      amount: 25,
      currency: 'USD',
      idempotencyKey: `seat-${tag}`,
      purchaseRef: seatRef,
    })
    const seatPayment = await db.payment.findUniqueOrThrow({
      where: { id: seat.paymentId },
      include: { receipt: true, payment_line_payment_line_payment_idTopayment: true },
    })
    assert.equal(seatPayment.status, 'captured')
    assert.equal(seatPayment.payment_line_payment_line_payment_idTopayment[0].line_type, 'seat_fee')
    assert.equal(seatPayment.payment_line_payment_line_payment_idTopayment[0].booking_coupon_id, couponOfA.id)
    assert.equal(seatPayment.receipt.length, 1)
    assert.equal(await db.finance_posting.count({ where: { posting_key: `payment_captured:${seat.paymentId}` } }), 1)
    const seatAgain = await charger.charge({
      bookingId: a.bookingId,
      amount: 25,
      currency: 'USD',
      idempotencyKey: `seat-${tag}`,
      purchaseRef: seatRef,
    })
    assert.equal(seatAgain.paymentId, seat.paymentId)
    await assert.rejects(
      charger.charge({
        bookingId: a.bookingId,
        amount: 30,
        currency: 'USD',
        idempotencyKey: `seat-${tag}`,
        purchaseRef: seatRef,
      }),
    )
    const cover = await charger.charge({
      bookingId: a.bookingId,
      amount: 12,
      currency: 'USD',
      idempotencyKey: `ins-${tag}`,
      purchaseRef: `insurance:${a.bookingId}`,
      line: { lineType: 'insurance', sourceRef: `insurance:${a.bookingId}`, description: 'Travel insurance' },
    })
    assert.equal((await db.payment_line.findFirstOrThrow({ where: { payment_id: cover.paymentId } })).line_type, 'insurance')
    step(
      'a paid seat and insurance are charged inside Feature 3’s transaction: seat_fee / insurance line, receipt, journal row; a repeat is the same payment, a changed amount is refused',
    )

    /* 6c. A miles booking: Feature 11 holds the miles, 5a collects the cash part as award_fee lines (or nothing), and the
          receipt says how many miles paid. Feature 3's own hold refuses miles for now, so the booking is made the way a hold
          would: award seats held, then Feature 11's real redeem. */
    // The miles balance only changes through the ledger, so use a member who already has enough.
    const member = await db.loyalty_member.findFirstOrThrow({
      where: { miles_balance: { gte: 18_000 } },
      select: { id: true, customer: { select: { id: true, user_id: true } } },
    })
    const flier = member.customer
    // Award bookings close 72 hours before departure (loyalty_setting), so they go on a flight at least four days ahead.
    const far = await db.seat_inventory.findFirstOrThrow({
      where: { cabin: 'economy', flight: { status: 'scheduled', dep_at: { gt: new Date(Date.now() + 4 * 86_400_000) } } },
      select: { flight_id: true },
    })
    const releaser = await db.staff.findFirstOrThrow({ where: { deleted_at: null }, select: { id: true } })
    await db.seat_inventory.update({
      where: { flight_id_cabin: { flight_id: far.flight_id, cabin: 'economy' } },
      data: { award_limit: { increment: 10 } },
    })
    await db.loyalty_award_release.upsert({
      where: { flight_id_cabin: { flight_id: far.flight_id, cabin: 'economy' } },
      create: { flight_id: far.flight_id, cabin: 'economy', miles_cost: 9_000, released_by_staff_id: releaser.id },
      update: {},
    })
    const awardBooking = async (cashDue: number) => {
      const booking = await held(flier.id, 15, far.flight_id)
      await db.seat_inventory.update({
        where: { flight_id_cabin: { flight_id: far.flight_id, cabin: 'economy' } },
        data: { award_held_count: { increment: 1 } },
      })
      await db.booking.update({ where: { id: booking.bookingId }, data: { payment_type: 'miles' } })
      await db.booking_coupon.updateMany({ where: { booking_id: booking.bookingId }, data: { price_total: cashDue } })
      await db.$transaction((tx) => app.get(LoyaltyAwardService).redeem(tx, booking.bookingId, { seatsAlreadyHeld: true }))
      return booking
    }
    const award = await awardBooking(60)
    const awardPaid = await call(flier.user_id, '/checkout', { booking_reference: award.reference }, { 'idempotency-key': `bk-${tag}-w1` })
    assert.equal(awardPaid.status, 200, JSON.stringify(awardPaid.body))
    assert.equal(awardPaid.body.status, 'captured')
    const awardPayment = await db.payment.findUniqueOrThrow({
      where: { id: awardPaid.body.payment_id },
      include: { payment_line_payment_line_payment_idTopayment: true },
    })
    assert.equal(Number(awardPayment.amount_total), 60)
    assert.equal(awardPayment.payment_line_payment_line_payment_idTopayment[0].line_type, 'award_fee')
    assert.equal((await db.booking.findUniqueOrThrow({ where: { id: award.bookingId } })).status, 'confirmed')
    const receiptView = await get(flier.user_id, `/payments/${awardPayment.id}/receipt`)
    assert.equal(receiptView.status, 200, JSON.stringify(receiptView.body))
    assert.equal(receiptView.body.miles_redeemed, 9_000, JSON.stringify(receiptView.body))
    step('miles + cash: the taxes are award_fee lines, Feature 3 confirms the award booking, the receipt says 9,000 miles')

    const noTaxes = await awardBooking(0)
    const zeroCash = await call(flier.user_id, '/checkout', { booking_reference: noTaxes.reference }, { 'idempotency-key': `bk-${tag}-w2` })
    assert.equal(zeroCash.status, 200, JSON.stringify(zeroCash.body))
    assert.equal(zeroCash.body.status, 'captured')
    const zeroPayment = await db.payment.findUniqueOrThrow({ where: { id: zeroCash.body.payment_id }, include: { receipt: true } })
    assert.equal(zeroPayment.provider, 'none')
    assert.equal(Number(zeroPayment.amount_total), 0)
    assert.equal(zeroPayment.receipt.length, 1)
    assert.equal(Number(zeroPayment.receipt[0].amount), 0)
    assert.equal(await db.finance_posting.count({ where: { source_id: zeroPayment.id } }), 0)
    step('a miles booking with no taxes due: a zero-cash payment on provider none, a 0.00 receipt, nothing posted')

    /* 7. Cargo: the shipper pays, 17's booking goes held -> booked, the Air Waybill is issued at capture, a cancel refunds once. */
    const rate = await db.cargo_rate.findFirstOrThrow({
      where: { is_active: true, cargo_commodity_type: { handling_class: 'general' } },
      select: { id: true, commodity_type_id: true, rate_per_kg: true, min_charge: true },
    })
    const cargoFlight = await db.flight.findUniqueOrThrow({ where: { id: flight.id }, select: { id: true, route_id: true } })
    let cargoNo = 0
    const heldCargo = async (holdMinutesLeft = 15) => {
      cargoNo += 1
      const bookedAt = new Date(Date.now() - 60_000)
      const kg = 120
      const charge = Math.round(Math.max(kg * Number(rate.rate_per_kg), Number(rate.min_charge)) * 100) / 100
      const booking = await db.cargo_booking.create({
        data: {
          booking_ref: `CG-${tag.slice(0, 5)}${cargoNo}`.toUpperCase(),
          customer_id: me.id,
          route_id: cargoFlight.route_id,
          flight_id: cargoFlight.id,
          ship_date: new Date(),
          commodity_type_id: rate.commodity_type_id,
          handling_class: 'general',
          goods_description: 'Smoke test goods',
          pieces: 2,
          declared_weight_kg: kg,
          declared_volume_m3: 1.5,
          shipper_name: 'Smoke Shipper',
          consignee_name: 'Smoke Consignee',
          consignee_address: '1 Test Road',
          distance_km: 675,
          quoted_chargeable_kg: kg,
          quoted_rate_id: rate.id,
          rate_per_kg: rate.rate_per_kg,
          min_charge: rate.min_charge,
          quoted_charge: charge,
          currency: 'USD',
          booked_at: bookedAt,
          hold_expires_at: new Date(Date.now() + holdMinutesLeft * 60_000),
        },
      })
      await db.cargo_shipment_event.create({
        data: {
          cargo_booking_id: booking.id,
          status_after: 'held',
          event_type: 'held',
          flight_id: cargoFlight.id,
          actor_type: 'customer',
          occurred_at: bookedAt,
        },
      })
      return booking
    }
    const statusOf = async (id: string) =>
      (await db.cargo_shipment_event.findFirstOrThrow({ where: { cargo_booking_id: id }, orderBy: { seq: 'desc' } })).status_after

    const cargo = await heldCargo()
    const paidCargo = await call(me.user_id, '/checkout', { cargo_booking_id: cargo.id }, { 'idempotency-key': `bk-${tag}-g1` })
    assert.equal(paidCargo.status, 200, JSON.stringify(paidCargo.body))
    assert.equal(paidCargo.body.status, 'captured')
    const cargoPayment = await db.payment.findUniqueOrThrow({ where: { id: paidCargo.body.payment_id }, include: { receipt: true } })
    assert.equal(cargoPayment.source_feature, 17)
    assert.equal(cargoPayment.purchase_ref, `cargo_booking:${cargo.id}`)
    assert.equal(Number(cargoPayment.amount_total), Number(cargo.quoted_charge))
    assert.equal(cargoPayment.receipt[0].document_type, 'invoice')
    const issued = await db.cargo_booking.findUniqueOrThrow({ where: { id: cargo.id } })
    assert.equal(issued.payment_id, cargoPayment.id)
    assert.match(issued.awb_number ?? '', /^999[0-9]{7}[0-6]$/)
    assert.equal(await statusOf(cargo.id), 'booked')
    step(`cargo: the shipper pays ${String(cargo.quoted_charge)}, 17's booking is booked, waybill ${issued.awb_number}, an invoice`)

    const again = await call(me.user_id, '/checkout', { cargo_booking_id: cargo.id }, { 'idempotency-key': `bk-${tag}-g2` })
    assert.equal(again.status, 409)
    assert.equal(again.body.error.code, 'CARGO_NOT_PAYABLE')
    const stranger = await call(other.user_id, '/checkout', { cargo_booking_id: cargo.id }, { 'idempotency-key': `bk-${tag}-g3` })
    assert.equal(stranger.status, 404)
    step('a booked cargo booking is not payable again (CARGO_NOT_PAYABLE); someone else’s answers 404')

    const cargoRefunds = app.get(CargoRefundAdapter)
    const reweigh = await cargoRefunds.refund({
      cargoBookingId: cargo.id,
      reason: 'cargo_reweigh',
      amount: 30,
      note: 'Weighed 10 kg lower',
      reweighNo: 1,
    })
    assert.equal(Number(reweigh?.amount), 30)
    assert.equal(reweigh?.source_key, `cargo_reweigh:${cargo.id}:1`)
    const cancelAmount = Number(cargo.quoted_charge) - 30
    await cargoRefunds.refund({ cargoBookingId: cargo.id, reason: 'cargo_cancel', amount: cancelAmount, note: 'Shipper cancelled' })
    await cargoRefunds.refund({ cargoBookingId: cargo.id, reason: 'cargo_cancel', amount: cancelAmount, note: 'Shipper cancelled' })
    const cargoRefundRows = await db.refund.findMany({ where: { payment_id: cargoPayment.id }, include: { refund_line: true } })
    assert.deepEqual(cargoRefundRows.map((r) => r.reason).sort(), ['cargo_cancel', 'cargo_reweigh'])
    assert.equal(
      cargoRefundRows.reduce((sum, r) => sum + Number(r.amount), 0),
      Number(cargo.quoted_charge),
    )
    assert.equal((await db.payment.findUniqueOrThrow({ where: { id: cargoPayment.id } })).status, 'reversed')
    step('cargo: a re-weigh refunds the difference, the cancel refunds the rest once, and the payment is reversed')

    const tooLate = await heldCargo(2)
    const cargoShort = await call(me.user_id, '/checkout', { cargo_booking_id: tooLate.id }, { 'idempotency-key': `bk-${tag}-g5` })
    assert.equal(cargoShort.status, 409)
    assert.equal(cargoShort.body.error.code, 'HOLD_TOO_SHORT')
    step('cargo: a hold with under 3 minutes left is HOLD_TOO_SHORT')

    /* The waybill is issued later when the app stopped between the capture and the waybill. */
    const lost = await heldCargo()
    const lostPay = await call(me.user_id, '/checkout', { cargo_booking_id: lost.id }, { 'idempotency-key': `bk-${tag}-g6` })
    assert.equal(lostPay.body.status, 'captured')
    await db.$executeRaw`UPDATE cargo_booking SET payment_id = NULL, awb_number = NULL, awb_issued_at = NULL WHERE id = ${lost.id}::uuid`
    assert.ok((await app.get(CargoSellerService).issueMissingAirWaybills()) >= 1)
    assert.match((await db.cargo_booking.findUniqueOrThrow({ where: { id: lost.id } })).awb_number ?? '', /^999[0-9]{7}[0-6]$/)
    step('cargo: a captured payment whose waybill was lost gets it from the maintenance pass')

    /* 8. Onboard products (feature 12): an order is a 5a payment, paid at checkout; F12 confirms the order; a cancel refunds. */
    const onboard = app.get(OnboardPaymentsAdapter)
    const confirmedBooking = await db.booking.findFirstOrThrow({ where: { customer_id: me.id, status: 'confirmed' }, select: { id: true } })
    const order = async (minutesLeft: number) =>
      db.product_order.create({
        data: {
          customer_id: me.id,
          booking_id: confirmedBooking.id,
          flight_id: flight.id,
          cabin: 'economy',
          status: 'pending_payment',
          total_amount: 20,
          currency: 'USD',
          expires_at: new Date(Date.now() + minutesLeft * 60_000),
        },
      })
    const placed = await order(30)
    const started = await onboard.startPayment({ reference: placed.id, amount: 20, currency: 'USD', customerId: me.id })
    assert.equal(started.status, 'pending')
    await db.product_order.update({ where: { id: placed.id }, data: { payment_id: started.paymentId } })
    assert.equal(await onboard.isPaymentConfirmed(started.paymentId), false)
    assert.equal(
      (await onboard.startPayment({ reference: placed.id, amount: 20, currency: 'USD', customerId: me.id })).paymentId,
      started.paymentId,
    )

    const stranger2 = await call(other.user_id, '/checkout', { payment_id: started.paymentId }, { 'idempotency-key': `bk-${tag}-o0` })
    assert.equal(stranger2.status, 404)
    const paidOrder = await call(me.user_id, '/checkout', { payment_id: started.paymentId }, { 'idempotency-key': `bk-${tag}-o1` })
    assert.equal(paidOrder.status, 200, JSON.stringify(paidOrder.body))
    assert.equal(paidOrder.body.status, 'captured')
    assert.equal((await db.product_order.findUniqueOrThrow({ where: { id: placed.id } })).status, 'confirmed')
    const orderPayment = await db.payment.findUniqueOrThrow({
      where: { id: started.paymentId },
      include: { payment_line_payment_line_payment_idTopayment: true },
    })
    assert.equal(orderPayment.source_feature, 12)
    assert.equal(orderPayment.payment_line_payment_line_payment_idTopayment[0].line_type, 'onboard_order')
    assert.equal(await db.finance_posting.count({ where: { posting_key: `payment_captured:${started.paymentId}` } }), 1)
    assert.equal(await onboard.isPaymentConfirmed(started.paymentId), true)
    step('an onboard order: F12 starts a 5a payment, the customer pays it by payment_id, F12 confirms the order, the card is captured')

    assert.equal(await onboard.refund(started.paymentId, 20, 'customer cancelled the order'), true)
    assert.equal(await onboard.refund(started.paymentId, 20, 'customer cancelled the order'), true)
    const orderRefunds = await db.refund.findMany({ where: { payment_id: started.paymentId } })
    assert.equal(orderRefunds.length, 1)
    assert.equal(orderRefunds[0].source_key, `order_cancel:${started.paymentId}`)
    assert.equal(Number(orderRefunds[0].amount), 20)
    step('cancelling the paid order refunds it to the card once')

    /* An order that expired before the money arrived: F12 refuses, the authorisation is voided, nobody is charged. */
    const late = await order(30)
    const lateStart = await onboard.startPayment({ reference: late.id, amount: 20, currency: 'USD', customerId: me.id })
    await db.product_order.update({
      where: { id: late.id },
      data: { payment_id: lateStart.paymentId, expires_at: new Date(Date.now() - 60_000) },
    })
    const lateRun = await call(me.user_id, '/checkout', { payment_id: lateStart.paymentId }, { 'idempotency-key': `bk-${tag}-o2` })
    assert.equal(lateRun.status, 200, JSON.stringify(lateRun.body))
    assert.equal((await db.payment.findUniqueOrThrow({ where: { id: lateStart.paymentId } })).status, 'voided')
    assert.equal(await db.refund.count({ where: { payment_id: lateStart.paymentId } }), 0)
    step('an order paid after it expired: F12 refuses, the authorisation is voided, no refund')

    /* A customer cancels a pre-order before paying: its payment is closed, so it cannot be paid later. */
    const unpaid = await order(30)
    const unpaidStart = await onboard.startPayment({ reference: unpaid.id, amount: 20, currency: 'USD', customerId: me.id })
    assert.equal(await onboard.refund(unpaidStart.paymentId, 20, 'cancelled before paying'), true)
    assert.equal((await db.payment.findUniqueOrThrow({ where: { id: unpaidStart.paymentId } })).status, 'failed')
    step('cancelling an unpaid pre-order closes its payment')

    /* A sale on board: no customer, no booking, paid on the spot on the fake provider. */
    const sold = await onboard.collect({ reference: `sale:${flight.id}:${tag}`, amount: 12, currency: 'USD', customerId: null })
    assert.equal(sold.status, 'paid')
    const sale = await db.payment.findUniqueOrThrow({ where: { id: sold.paymentId }, include: { receipt: true } })
    assert.equal(sale.payer_customer_id, null)
    assert.equal(sale.provider, 'fake')
    assert.equal(sale.receipt.length, 1)
    assert.equal(await db.finance_posting.count({ where: { posting_key: `payment_captured:${sold.paymentId}` } }), 1)
    step('a sale on board: a captured payment on the fake provider with no payer, a receipt and a journal row')

    /* Travel insurance is only sold to the tiers that offer it. */
    const noOffer = await held(me.id)
    const refusedInsurance = await call(
      me.user_id,
      '/checkout',
      { booking_reference: noOffer.reference, add_insurance: true },
      { 'idempotency-key': `bk-${tag}-i1` },
    )
    assert.equal(refusedInsurance.status, 422, JSON.stringify(refusedInsurance.body))
    assert.equal(refusedInsurance.body.error.code, 'PAYMENT_NOT_PAYABLE')
    step('add_insurance is refused (422) unless the booker’s tier sells it')

    console.log('\nAll checks passed against the real database.')
  } finally {
    await app.close()
  }
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})

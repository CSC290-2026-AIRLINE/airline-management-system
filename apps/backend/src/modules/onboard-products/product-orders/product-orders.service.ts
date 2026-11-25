// ProductOrdersService: the customer checkout and the order lifecycle.
//
// The rules the doc states, and where they live here:
//   - the booking belongs to the caller and is confirmed;
//   - every product is on the flight's menu (flight rows, else route
//     rows, else network rows — the most specific level replaces the
//     others as a whole, and premium economy reads the economy menu);
//   - at most one meal per passenger per flight;
//   - the order window is still open;
//   - available warehouse stock covers each line;
//   - the order is priced (tier benefit, complimentary allowance,
//     premium meals charged) and the total is sent to F5;
//   - a total of 0 skips F5 and confirms at once;
//   - every status change is guarded, so a repeated call cannot move
//     an order twice.

import { DEMO_CABIN, DEMO_FLIGHT_ID, demoEnabled } from '../common/demo-booking'
import { PaymentEventsService } from '../payment-events/payment-events.service'
import { Injectable } from '@nestjs/common'
import type { Prisma } from '../../../db/generated/prisma/client'
import { DbService } from '../../../db/db.service'
import { ApiErrorException } from '../common/api-error'
import { AuditService } from '../common/audit.service'
import { CateringSettingsService } from '../common/catering-settings.service'
import { SystemClock } from '../common/clock'
import { FlightContextService } from '../common/flight-context.service'
import { resolveOfferings, type OfferingRow } from '../common/menu'
import { toNumber, type F12Cabin } from '../common/mapping'
import { cutoffAt, isOrderWindowOpen, orderExpiresAt, priceOrder, type OrderLineInput, roundMoney } from '../common/order-pricing'
import { ReservationsService } from '../common/reservations.service'
import { StubBookingsService, StubPaymentsService, StubTierService } from '../common/cross-module-ports'
import { CabinSettingsService } from '../cabin-settings/cabin-settings.service'
import {
  parseCheckoutInput,
  type CheckoutInput,
  type CheckoutLineInput,
  type ProductOrderDto,
  type ProductOrderLineDto,
  type ProductOrderPaymentStatus,
  type ProductOrderStatus,
} from './dto/product-order.dto'

interface ProductRow {
  id: string
  sku: string
  name: string
  category: string
  type_code: string
  price_amount: unknown
  is_premium: boolean
  is_active: boolean
  image_key: string | null
}

@Injectable()
export class ProductOrdersService {
  constructor(
    private readonly db: DbService,
    private readonly clock: SystemClock,
    private readonly audit: AuditService,
    private readonly bookings: StubBookingsService,
    private readonly payments: StubPaymentsService,
    private readonly tiers: StubTierService,
    private readonly settings: CabinSettingsService,
    private readonly cateringSettings: CateringSettingsService,
    private readonly flightContext: FlightContextService,
    private readonly reservations: ReservationsService,
    private readonly paymentEvents: PaymentEventsService,
  ) {}

  async demoBooking(customerId: string, id: string) {
    if (!demoEnabled() || (id !== 'demo' && id !== customerId)) {
      throw new ApiErrorException('NOT_FOUND', 'Onboard booking not found.', 404)
    }
    const customer = await this.db.customer.findUniqueOrThrow({ where: { id: customerId }, include: { passenger: true } })
    const flight = await this.flightContext.getFlight(DEMO_FLIGHT_ID)
    const settings = await this.settings.resolveForFlight(flight.id, DEMO_CABIN)
    const passenger = customer.passenger
    return {
      id: customerId,
      reference: 'F12-DEMO',
      status: 'confirmed',
      passengers: [
        { id: passenger.id, firstName: passenger.first_name, lastName: passenger.last_name, type: 'adult', isAccountHolder: true },
      ],
      flights: [
        {
          id: flight.id,
          flightNumber: flight.flightNumber,
          origin: { code: flight.origin, city: flight.origin },
          destination: { code: flight.destination, city: flight.destination },
          scheduledDeparture: flight.scheduledDeparture.toISOString(),
          cabinClass: DEMO_CABIN,
          seatNumbers: [],
          cutoffAt: cutoffAt(flight.scheduledDeparture, settings.orderWindowHours).toISOString(),
        },
      ],
      totalPassengers: 1,
      tripType: 'one_way',
      routeSummary: `${flight.origin} to ${flight.destination}`,
    }
  }

  async demoPayment(customerId: string, id: string, status: unknown) {
    if (!demoEnabled()) throw new ApiErrorException('NOT_FOUND', 'Demo payments are unavailable.', 404)
    const order = await this.get(customerId, id)
    if (order.flightId !== DEMO_FLIGHT_ID || order.bookingId !== customerId || !order.paymentId) {
      throw new ApiErrorException('NOT_FOUND', 'Demo payment not found.', 404)
    }
    await this.paymentEvents.handle({ reference: order.id, paymentId: order.paymentId, status })
    return this.get(customerId, id)
  }

  // -- catalogue ------------------------------------------------------------

  // GET /catalog: the menu for a flight and cabin, with the resolved
  // policy, the prices, the dietary badges, the stock status and the
  // order window.
  async catalog(query: { bookingId?: string; flightId?: string; cabin?: string }, customerId: string): Promise<unknown> {
    const flightId = query.flightId
    if (!flightId) throw new ApiErrorException('LINE_INVALID', 'flightId is required.', 400)
    const flight = await this.flightContext.getFlight(flightId)
    const cabin = this.resolveCabin(query.cabin)
    const settings = await this.settings.resolveForFlight(flightId, cabin)
    const now = this.clock.now()
    const cutoff = await this.customerCutoff(this.db, flight.id, cutoffAt(flight.scheduledDeparture, settings.orderWindowHours))

    const menu = await this.menuFor(flightId, flight.routeId, cabin)
    const productIds = menu.map((m) => m.productId)
    const products = productIds.length
      ? await this.db.product.findMany({
          where: { id: { in: productIds }, deleted_at: null, is_active: true },
          include: { product_dietary: true },
        })
      : []

    let warehouseId: string | null = null
    try {
      warehouseId = (await this.flightContext.warehouseForFlight(flightId)).id
    } catch {
      // A flight with no warehouse still shows its menu; the stock
      // status simply reads as unavailable.
      warehouseId = null
    }
    const stockRows = warehouseId ? await this.db.warehouse_stock.findMany({ where: { warehouse_id: warehouseId } }) : []
    const availableByProduct = new Map(stockRows.map((s) => [s.product_id, s.quantity_on_hand - s.quantity_reserved]))

    return {
      flightId,
      flightNumber: flight.flightNumber,
      routeId: flight.routeId,
      departureAirport: flight.origin,
      arrivalAirport: flight.destination,
      scheduledDeparture: flight.scheduledDeparture.toISOString(),
      bookingId: query.bookingId ?? null,
      currency: await this.cateringSettings.baseCurrency(),
      cabin,
      settings,
      complimentarySnackAvailable:
        settings.snackService === 'complimentary' && !(await this.hasComplimentarySnack(this.db, customerId, flightId)),
      cutoffAt: cutoff.toISOString(),
      orderWindowOpen: isOrderWindowOpen(now, cutoff),
      products: products.map((p) => {
        const available = availableByProduct.get(p.id) ?? 0
        return {
          id: p.id,
          sku: p.sku,
          name: p.name,
          description: p.description,
          category: p.category,
          typeCode: p.type_code,
          priceAmount: toNumber(p.price_amount),
          isPremium: p.is_premium,
          imageKey: p.image_key,
          dietaryAttributes: p.product_dietary.map((d) => d.attribute),
          availableQuantity: available,
          stockStatus: available > 0 ? 'in_stock' : 'out_of_stock',
        }
      }),
    }
  }

  private async hasComplimentarySnack(
    db: Pick<Prisma.TransactionClient, 'product_order_line'>,
    customerId: string,
    flightId: string,
  ): Promise<boolean> {
    return !!(await db.product_order_line.findFirst({
      where: {
        flight_id: flightId,
        category: { in: ['snack', 'beverage'] },
        price_basis: 'included',
        deleted_at: null,
        product_order: { customer_id: customerId, status: { in: ['pending_payment', 'confirmed'] } },
      },
      select: { id: true },
    }))
  }

  // -- checkout -------------------------------------------------------------

  async checkout(customerId: string, rawInput: unknown): Promise<ProductOrderDto> {
    const input: CheckoutInput = parseCheckoutInput(rawInput)

    if (input.flightId === DEMO_FLIGHT_ID) {
      if (input.bookingId !== customerId || input.cabin !== DEMO_CABIN) {
        throw new ApiErrorException('BOOKING_NOT_CONFIRMED', 'The demo booking does not match this flight and cabin.', 409)
      }
      const demo = await this.demoBooking(customerId, input.bookingId)
      const passengerId = demo.passengers[0].id
      if (input.lines.some((line) => line.bookingPassengerId && line.bookingPassengerId !== passengerId)) {
        throw new ApiErrorException('LINE_INVALID', 'The passenger is not on this booking.', 400)
      }
    }
    const booking = await this.bookings.getBooking(input.bookingId)
    if (!booking || booking.status !== 'confirmed') {
      throw new ApiErrorException('BOOKING_NOT_CONFIRMED', 'The booking is not confirmed.', 409)
    }
    if (booking.customerId && booking.customerId !== customerId) {
      throw new ApiErrorException('BOOKING_NOT_CONFIRMED', 'The booking belongs to another customer.', 403)
    }

    const flight = await this.flightContext.getFlight(input.flightId)
    const settings = await this.settings.resolveForFlight(input.flightId, input.cabin)
    const now = this.clock.now()
    const cutoff = await this.customerCutoff(this.db, flight.id, cutoffAt(flight.scheduledDeparture, settings.orderWindowHours))
    if (!settings.preorderEnabled) {
      throw new ApiErrorException('ORDER_WINDOW_CLOSED', 'Pre-ordering is not available in this cabin.', 409)
    }
    if (!isOrderWindowOpen(now, cutoff)) {
      throw new ApiErrorException('ORDER_WINDOW_CLOSED', 'The order window for this flight has closed.', 409, {
        cutoffAt: cutoff.toISOString(),
      })
    }

    const products = await this.loadProducts(input.lines)
    await this.assertOnMenu(input, products, flight.routeId, settings)
    await this.assertMealRules(input, products, settings.mealService, settings.mealSelection)

    const tier = await this.tiers.getTierForCustomer(customerId)
    const pricingLines: OrderLineInput[] = input.lines.map((line) => {
      const product = products.get(line.productId)!
      return {
        productId: line.productId,
        category: product.category as OrderLineInput['category'],
        quantity: line.quantity,
        priceAmount: toNumber(product.price_amount),
        isPremium: product.is_premium,
      }
    })
    const priced = priceOrder(pricingLines, {
      mealService: settings.mealService,
      includedPerPassenger: settings.includedPerPassenger,
      hasTier: tier !== 'none',
    })

    const warehouse = await this.flightContext.warehouseForFlight(input.flightId)
    const holdMinutes = await this.cateringSettings.paymentHoldMinutes()
    const currency = await this.cateringSettings.baseCurrency()
    const expiresAt = orderExpiresAt(now, holdMinutes, cutoff)

    // One reservation per product, for the whole order.
    const quantitiesByProduct = new Map<string, number>()
    for (const line of input.lines) {
      quantitiesByProduct.set(line.productId, (quantitiesByProduct.get(line.productId) ?? 0) + line.quantity)
    }

    const orderId = await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM flight WHERE id = ${input.flightId}::uuid FOR UPDATE`
      const currentCutoff = await this.customerCutoff(tx, input.flightId, cutoff)
      if (!isOrderWindowOpen(this.clock.now(), currentCutoff)) {
        throw new ApiErrorException('ORDER_WINDOW_CLOSED', 'The order window for this flight has closed.', 409)
      }
      const snackIndex = priced.lines.findIndex((line) => line.category === 'snack' || line.category === 'beverage')
      let complimentary = false
      if (settings.snackService === 'complimentary' && snackIndex !== -1) {
        // Serialize redemptions for this customer without changing the order-line schema.
        await tx.$queryRaw`SELECT id FROM customer WHERE id = ${customerId}::uuid FOR UPDATE`
        complimentary = !(await this.hasComplimentarySnack(tx, customerId, input.flightId))
      }
      const totalAmount = roundMoney(priced.totalAmount - (complimentary ? priced.lines[snackIndex].unitPriceAmount : 0))
      const order = await tx.product_order.create({
        data: {
          customer_id: customerId,
          booking_id: input.bookingId,
          flight_id: input.flightId,
          cabin: input.cabin,
          status: 'pending_payment',
          total_amount: totalAmount,
          currency,
          payment_id: null,
          paid_at: null,
          expires_at: expiresAt,
          cancelled_at: null,
        },
      })
      await tx.product_order_line.createMany({
        data: input.lines.flatMap((line, i) => {
          const pricedLine = priced.lines[i]
          const product = products.get(line.productId)!
          const data = {
            product_order_id: order.id,
            flight_id: input.flightId,
            product_id: line.productId,
            category: product.category,
            booking_passenger_id: product.category === 'meal' ? line.bookingPassengerId : null,
            quantity: line.quantity,
            unit_price_amount: pricedLine.unitPriceAmount,
            price_basis: pricedLine.priceBasis,
          }
          if (!complimentary || i !== snackIndex) return [data]
          const included = { ...data, quantity: 1, unit_price_amount: 0, price_basis: 'included' }
          return data.quantity === 1 ? [included] : [included, { ...data, quantity: data.quantity - 1 }]
        }),
      })
      for (const [productId, quantity] of quantitiesByProduct) {
        await this.reservations.reserve(tx, {
          warehouseId: warehouse.id,
          productId,
          quantity,
          orderId: order.id,
          flightId: input.flightId,
          occurredAt: now,
          productName: products.get(productId)?.name,
        })
      }
      if (totalAmount === 0) {
        // Nothing to collect: the order is confirmed at once.
        await tx.product_order.update({
          where: { id: order.id },
          data: { status: 'confirmed', paid_at: now },
        })
      } else {
        const payment = await this.payments.startPayment({
          reference: order.id,
          amount: totalAmount,
          currency,
          customerId,
        })
        await tx.product_order.update({ where: { id: order.id }, data: { payment_id: payment.paymentId } })
      }
      await this.audit.record(
        {
          actorType: 'customer',
          actorId: customerId,
          actorRole: null,
          sourceFeature: 'onboard-products',
          action: 'product_order.create',
          entityType: 'product_order',
          entityId: order.id,
          summary: `Checked out ${input.lines.length} line(s) for flight ${input.flightId} (${totalAmount} ${currency}).`,
        },
        tx,
      )
      return order.id
    })

    return this.get(customerId, orderId)
  }

  // -- reads ----------------------------------------------------------------

  async list(customerId: string, bookingId?: string): Promise<ProductOrderDto[]> {
    const rows = await this.db.product_order.findMany({
      where: {
        customer_id: customerId,
        ...(bookingId ? { booking_id: bookingId } : {}),
      },
      include: { product_order_line: { include: { product: true } }, flight: { include: { route: true } } },
      orderBy: { created_at: 'desc' },
    })
    return Promise.all(rows.map((row) => this.toDto(row)))
  }

  async get(customerId: string, orderId: string): Promise<ProductOrderDto> {
    const row = await this.db.product_order.findFirst({
      where: { id: orderId, customer_id: customerId },
      include: { product_order_line: { include: { product: true } }, flight: { include: { route: true } } },
    })
    if (!row) throw new ApiErrorException('NOT_FOUND', 'Order not found.', 404)
    return this.toDto(row)
  }

  // -- cancel ---------------------------------------------------------------

  // DELETE /product-orders/:id: cancel before the cutoff. The
  // reservation is released and F5 is asked to refund.
  async cancel(customerId: string, orderId: string): Promise<ProductOrderDto> {
    const order = await this.db.product_order.findFirst({
      where: { id: orderId, customer_id: customerId },
      include: { product_order_line: true },
    })
    if (!order) throw new ApiErrorException('NOT_FOUND', 'Order not found.', 404)
    if (order.status === 'cancelled') return this.get(customerId, orderId)
    if (order.status === 'expired') {
      throw new ApiErrorException('ORDER_WINDOW_CLOSED', 'The order has already expired.', 409)
    }

    const flight = await this.flightContext.getFlight(order.flight_id)
    const settings = await this.settings.resolveForFlight(order.flight_id, order.cabin as F12Cabin)
    const cutoff = await this.customerCutoff(this.db, flight.id, cutoffAt(flight.scheduledDeparture, settings.orderWindowHours))
    if (!isOrderWindowOpen(this.clock.now(), cutoff)) {
      throw new ApiErrorException('ORDER_WINDOW_CLOSED', 'The order window for this flight has closed.', 409, {
        cutoffAt: cutoff.toISOString(),
      })
    }

    const warehouse = await this.flightContext.warehouseForFlight(order.flight_id)
    const now = this.clock.now()
    await this.db.$transaction(async (tx) => {
      const changed = await tx.product_order.updateMany({
        where: { id: order.id, status: order.status },
        data: { status: 'cancelled', cancelled_at: now },
      })
      if (changed.count === 0) {
        throw new ApiErrorException('CONFLICT', 'The order changed while it was being cancelled.', 409)
      }
      await tx.product_order_line.updateMany({
        where: { product_order_id: order.id, deleted_at: null },
        data: { deleted_at: now },
      })
      await this.releaseOrderStock(tx, order.id, order.flight_id, order.product_order_line, warehouse.id, now)
      await this.audit.record(
        {
          actorType: 'customer',
          actorId: customerId,
          actorRole: null,
          sourceFeature: 'onboard-products',
          action: 'product_order.cancel',
          entityType: 'product_order',
          entityId: order.id,
          summary: `Cancelled order ${order.id}.`,
        },
        tx,
      )
    })

    if (order.payment_id) {
      await this.payments.refund(order.payment_id, toNumber(order.total_amount), 'customer cancelled the order')
    }
    return this.get(customerId, orderId)
  }

  // -- expiry ---------------------------------------------------------------

  // The scheduled job: every order that was not paid before its
  // expiry is closed and the stock it held is given back. The
  // transition is guarded, so an order that was paid in the meantime
  // is left alone.
  async expireUnpaidOrders(now: Date): Promise<number> {
    const due = await this.db.product_order.findMany({
      where: { status: 'pending_payment', expires_at: { lte: now } },
      include: { product_order_line: { where: { deleted_at: null } } },
    })
    let expired = 0
    for (const order of due) {
      const changed = await this.db.product_order.updateMany({
        where: { id: order.id, status: 'pending_payment' },
        data: { status: 'expired' },
      })
      if (changed.count === 0) continue
      expired += 1
      const warehouse = await this.warehouseForFlight(order.flight_id)
      await this.db.$transaction(async (tx) => {
        await tx.product_order_line.updateMany({
          where: { product_order_id: order.id, deleted_at: null },
          data: { deleted_at: now },
        })
        if (warehouse) {
          await this.releaseOrderStock(tx, order.id, order.flight_id, order.product_order_line, warehouse, now)
        }
        await this.audit.record(
          {
            actorType: 'system',
            actorId: null,
            actorRole: null,
            sourceFeature: 'onboard-products',
            action: 'product_order.expire',
            entityType: 'product_order',
            entityId: order.id,
            summary: `Order ${order.id} expired unpaid; the stock was released.`,
          },
          tx,
        )
      })
    }
    return expired
  }

  async expireUnpaidForDemoClose(tx: Prisma.TransactionClient, flightId: string, warehouseId: string, now: Date): Promise<void> {
    const pending = await tx.product_order.findMany({
      where: { flight_id: flightId, status: 'pending_payment' },
      include: { product_order_line: { where: { deleted_at: null } } },
    })
    for (const order of pending) {
      const expired = await tx.product_order.updateMany({
        where: { id: order.id, status: 'pending_payment' },
        data: { status: 'expired', expires_at: now },
      })
      if (!expired.count) continue
      await tx.product_order_line.updateMany({ where: { product_order_id: order.id, deleted_at: null }, data: { deleted_at: now } })
      await this.releaseOrderStock(tx, order.id, flightId, order.product_order_line, warehouseId, now)
    }
  }

  private async customerCutoff(
    db: Pick<Prisma.TransactionClient, 'catering_order'>,
    flightId: string,
    scheduledCutoff: Date,
  ): Promise<Date> {
    const order = await db.catering_order.findUnique({ where: { flight_id: flightId }, select: { cutoff_at: true } })
    return order && order.cutoff_at < scheduledCutoff ? order.cutoff_at : scheduledCutoff
  }

  // -- helpers --------------------------------------------------------------

  // The warehouse at the flight's departure airport, or null when the
  // airport has none.
  private async warehouseForFlight(flightId: string): Promise<string | null> {
    try {
      return (await this.flightContext.warehouseForFlight(flightId)).id
    } catch {
      return null
    }
  }

  // Releases the stock an order holds. Shared with the payment-event
  // handler and the expiry job.
  async releaseOrderStock(
    tx: Prisma.TransactionClient,
    orderId: string,
    flightId: string,
    lines: Array<{ product_id: string; quantity: number }>,
    warehouseId: string,
    occurredAt: Date,
  ): Promise<void> {
    const byProduct = new Map<string, number>()
    for (const line of lines) {
      byProduct.set(line.product_id, (byProduct.get(line.product_id) ?? 0) + line.quantity)
    }
    for (const [productId, quantity] of byProduct) {
      await this.reservations.release(tx, {
        warehouseId,
        productId,
        quantity,
        orderId,
        flightId,
        occurredAt,
      })
    }
  }

  // The menu for a flight and cabin, resolved from the offering rows.
  async menuFor(flightId: string, routeId: string, cabin: F12Cabin): Promise<OfferingRow[]> {
    const rows = await this.db.product_offering.findMany({
      where: { deleted_at: null, product: { deleted_at: null, is_active: true } },
      include: { product: { select: { category: true } } },
    })
    const mapped: OfferingRow[] = rows.map((r) => ({
      category: r.product.category as OfferingRow['category'],
      id: r.id,
      productId: r.product_id,
      scope: r.scope as OfferingRow['scope'],
      routeId: r.route_id,
      flightId: r.flight_id,
      cabin: r.cabin as F12Cabin,
      isDefault: r.is_default,
      isActive: r.is_active,
    }))
    return resolveOfferings(mapped, { flightId, routeId, cabin })
  }

  private async loadProducts(lines: CheckoutLineInput[]): Promise<Map<string, ProductRow>> {
    const ids = [...new Set(lines.map((l) => l.productId))]
    const rows = (await this.db.product.findMany({
      where: { id: { in: ids }, deleted_at: null },
    })) as unknown as ProductRow[]
    const map = new Map(rows.map((r) => [r.id, r]))
    for (const id of ids) {
      const product = map.get(id)
      if (!product) throw new ApiErrorException('NOT_FOUND', `Product ${id} not found.`, 404)
      if (!product.is_active) {
        throw new ApiErrorException('PRODUCT_NOT_OFFERED', `${product.name} is not available.`, 409)
      }
    }
    return map
  }

  // Every product must be on the flight's menu, and the cabin's own
  // rules decide which categories and which meals are on it.
  private async assertOnMenu(
    input: CheckoutInput,
    products: Map<string, ProductRow>,
    routeId: string,
    settings: { snacksEnabled: boolean; dutyFreeEnabled: boolean; premiumMealsAllowed: boolean },
  ): Promise<void> {
    const menu = await this.menuFor(input.flightId, routeId, input.cabin)
    const menuIds = new Set(menu.map((m) => m.productId))

    for (const line of input.lines) {
      const product = products.get(line.productId)!
      if (!menuIds.has(line.productId)) {
        throw new ApiErrorException('PRODUCT_NOT_OFFERED', `${product.name} is not on the menu for this flight.`, 409, {
          product: line.productId,
        })
      }
      if ((product.category === 'snack' || product.category === 'beverage') && !settings.snacksEnabled) {
        throw new ApiErrorException('PRODUCT_NOT_OFFERED', 'Snacks and drinks are not offered in this cabin.', 409)
      }
      if (product.category === 'duty_free' && !settings.dutyFreeEnabled) {
        throw new ApiErrorException('PRODUCT_NOT_OFFERED', 'Duty-free is not offered in this cabin.', 409)
      }
      if (product.category === 'meal' && product.is_premium && !settings.premiumMealsAllowed) {
        throw new ApiErrorException('PRODUCT_NOT_OFFERED', 'Premium meals are not offered in this cabin.', 409)
      }
    }
  }

  // One meal per passenger per flight, and the meal rules of the
  // cabin: no meal service at all, or a fixed meal the passenger may
  // not choose.
  private async assertMealRules(
    input: CheckoutInput,
    products: Map<string, ProductRow>,
    mealService: string,
    mealSelection: string,
  ): Promise<void> {
    const seenPassengers = new Set<string>()
    for (const line of input.lines) {
      const product = products.get(line.productId)!
      if (product.category !== 'meal') {
        if (line.bookingPassengerId) {
          throw new ApiErrorException('LINE_INVALID', 'Only a meal line names a passenger.', 400)
        }
        continue
      }
      if (mealService === 'none') {
        throw new ApiErrorException('MEAL_CHOICE_NOT_ALLOWED', 'There is no meal service in this cabin.', 409)
      }
      if (mealSelection === 'fixed' && product.type_code === 'STD') {
        throw new ApiErrorException('MEAL_CHOICE_NOT_ALLOWED', 'The meal for this cabin is fixed.', 409)
      }
      if (!line.bookingPassengerId) {
        throw new ApiErrorException('LINE_INVALID', 'A meal line must name its passenger.', 400)
      }
      if (seenPassengers.has(line.bookingPassengerId)) {
        throw new ApiErrorException('MEAL_LIMIT_EXCEEDED', 'A passenger can order at most one meal per flight.', 409, {
          bookingPassengerId: line.bookingPassengerId,
        })
      }
      seenPassengers.add(line.bookingPassengerId)
    }

    // A meal on another open order for the same passenger and flight
    // counts too.
    const passengerIds = [...seenPassengers]
    if (passengerIds.length === 0) return
    const existing = await this.db.product_order_line.findMany({
      where: {
        flight_id: input.flightId,
        booking_passenger_id: { in: passengerIds },
        deleted_at: null,
        category: 'meal',
        product_order: { status: { in: ['pending_payment', 'confirmed'] } },
      },
      select: { booking_passenger_id: true },
    })
    if (existing.length > 0) {
      throw new ApiErrorException('MEAL_LIMIT_EXCEEDED', 'A passenger can order at most one meal per flight.', 409, {
        bookingPassengerId: existing[0].booking_passenger_id,
      })
    }
  }

  private resolveCabin(cabin?: string): F12Cabin {
    if (cabin === 'economy' || cabin === 'premium_economy' || cabin === 'business') return cabin
    return 'economy'
  }

  private async toDto(row: {
    id: string
    booking_id: string
    flight_id: string
    cabin: string
    status: string
    total_amount: unknown
    currency: string
    payment_id: string | null
    paid_at: Date | null
    expires_at: Date
    cancelled_at: Date | null
    created_at: Date
    flight: { flight_number: string; scheduled_dep_at: Date; route: { origin: string; destination: string } }
    product_order_line: Array<{
      id: string
      product_id: string
      category: string
      booking_passenger_id: string | null
      quantity: number
      unit_price_amount: unknown
      price_basis: string
      product: { name: string }
    }>
  }): Promise<ProductOrderDto> {
    const settings = await this.settings.resolveForFlight(row.flight_id, row.cabin as F12Cabin)
    const status = row.status as ProductOrderStatus
    const lines: ProductOrderLineDto[] = row.product_order_line.map((line) => ({
      id: line.id,
      productId: line.product_id,
      productName: line.product.name,
      category: line.category,
      bookingPassengerId: line.booking_passenger_id,
      quantity: line.quantity,
      unitPriceAmount: toNumber(line.unit_price_amount),
      priceBasis: line.price_basis,
      lineTotal: toNumber(line.unit_price_amount) * line.quantity,
    }))
    return {
      id: row.id,
      bookingId: row.booking_id,
      flightId: row.flight_id,
      flightNumber: row.flight.flight_number,
      flightOriginCode: row.flight.route.origin,
      flightDestinationCode: row.flight.route.destination,
      cutoffAt: cutoffAt(row.flight.scheduled_dep_at, settings.orderWindowHours).toISOString(),
      cabin: row.cabin,
      status,
      totalAmount: toNumber(row.total_amount),
      currency: row.currency,
      paymentId: row.payment_id,
      paymentStatus: this.paymentStatus(status, row.payment_id),
      paidAt: row.paid_at ? row.paid_at.toISOString() : null,
      expiresAt: row.expires_at.toISOString(),
      cancelledAt: row.cancelled_at ? row.cancelled_at.toISOString() : null,
      createdAt: row.created_at.toISOString(),
      lines,
    }
  }

  private paymentStatus(status: ProductOrderStatus, paymentId: string | null): ProductOrderPaymentStatus {
    if (status === 'confirmed') return paymentId ? 'paid' : 'none'
    if (status === 'pending_payment') return 'pending'
    return 'failed'
  }
}

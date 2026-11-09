// CateringOrdersService: per-flight catering order lifecycle.
//
// The flow the doc describes:
//   generate - the scheduled job writes the order at the cutoff
//              (the scheduled departure minus the shortest cabin order
//              window). The lines carry the paid customer orders
//              (source 'order') and the default meal for every
//              passenger who did not order one (source 'default');
//   refresh  - staff re-count the order after the cutoff. Before the
//              cutoff it is refused with ORDER_NOT_YET_DUE;
//   transfer - the stock moves to the aircraft (see
//              StockTransfersService; it is a separate step now);
//   loaded   - staff mark the order loaded once the transfer is done;
//   close    - end of flight (called from the flight report);
//   void     - cancel an order that has not been loaded yet.

import { Injectable } from '@nestjs/common'
import { DbService } from '../../../db/db.service'
import { ApiErrorException } from '../common/api-error'
import { AuditService } from '../common/audit.service'
import { SystemClock } from '../common/clock'
import { FlightContextService } from '../common/flight-context.service'
import { defaultOffering, type OfferingRow } from '../common/menu'
import type { F12Cabin, ResolvedCabinSetting } from '../common/mapping'
import { CabinSettingsService } from '../cabin-settings/cabin-settings.service'

export interface CateringOrderLineDto {
  id: string
  cabin: string
  productId: string
  productName: string
  quantityRequired: number
  quantityShort: number
  source: 'order' | 'default'
}

export interface CateringOrderDto {
  id: string
  flightId: string
  flightNumber: string
  routeId: string
  route: string
  departureAirport: string
  arrivalAirport: string
  scheduledDeparture: string
  passengerCount: number
  status: 'open' | 'generated' | 'loaded' | 'closed' | 'void'
  cutoffAt: string
  generatedAt: string
  loadedAt: string | null
  warehouseId: string
  aircraftId: string
  cabin: string
  lines: CateringOrderLineDto[]
  // True when the flight already has a submitted flight report. The
  // staff flight-report picker reads this from the same list.
  reportSubmitted: boolean
}

// The Iteration-02 doc has three cabin tiles: Economy, Premium
// economy and Business.
const CABINS: F12Cabin[] = ['economy', 'premium_economy', 'business']

interface LineDraft {
  cabin: string
  productId: string
  quantityRequired: number
  quantityShort: number
  source: 'order' | 'default'
}

interface PassengerSummary {
  passengers: number
  orderedMeals: number
  perCabin: Map<string, { passengers: number; ordered: number }>
}

@Injectable()
export class CateringOrdersService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
    private readonly clock: SystemClock,
    private readonly cabinSettings: CabinSettingsService,
    private readonly flightContext: FlightContextService,
  ) {}

  // List the flights with their catering order, so the staff list can
  // show the status of each one. The date range filters on the
  // scheduled departure.
  async listOpenAndOrdered(filter?: { from?: Date; to?: Date }): Promise<CateringOrderDto[]> {
    const flights = await this.db.flight.findMany({
      where: {
        status: { in: ['scheduled', 'boarding', 'departed', 'arrived', 'closed'] },
        ...(filter?.from || filter?.to
          ? {
              scheduled_dep_at: {
                ...(filter.from ? { gte: filter.from } : {}),
                ...(filter.to ? { lte: filter.to } : {}),
              },
            }
          : {}),
      },
      include: {
        route: true,
        flight_report: true,
        catering_order: { include: { catering_order_line: { include: { product: true } } } },
      },
      orderBy: { scheduled_dep_at: 'asc' },
    })
    const passengers = await this.passengerSummary(flights.map((f) => f.id))
    return flights.map((flight) => {
      const order = flight.catering_order
      const summary = passengers.get(flight.id)
      if (!order) {
        return this.openOrder(flight, summary?.passengers ?? 0, flight.scheduled_dep_at, flight.flight_report != null)
      }
      return {
        id: order.id,
        flightId: flight.id,
        flightNumber: flight.flight_number,
        routeId: flight.route_id,
        route: `${flight.route.origin} → ${flight.route.destination}`,
        departureAirport: flight.route.origin,
        arrivalAirport: flight.route.destination,
        scheduledDeparture: flight.scheduled_dep_at.toISOString(),
        passengerCount: summary?.passengers ?? 0,
        status: order.status as CateringOrderDto['status'],
        cutoffAt: order.cutoff_at.toISOString(),
        generatedAt: order.generated_at.toISOString(),
        loadedAt: order.loaded_at ? order.loaded_at.toISOString() : null,
        warehouseId: order.warehouse_id,
        aircraftId: flight.aircraft_id,
        cabin: 'economy',
        lines: order.catering_order_line.map((l) => ({
          id: l.id,
          cabin: l.cabin,
          productId: l.product_id,
          productName: l.product.name,
          quantityRequired: l.quantity_required,
          quantityShort: l.quantity_short,
          source: l.source as 'order' | 'default',
        })),
        reportSubmitted: flight.flight_report != null,
      }
    })
  }

  async get(flightId: string): Promise<CateringOrderDto> {
    const order = await this.db.catering_order.findUnique({
      where: { flight_id: flightId },
      include: {
        catering_order_line: { include: { product: true } },
        flight: { include: { route: true, flight_report: true } },
      },
    })
    if (!order) {
      // The order does not exist yet: it is generated at the cutoff.
      // The staff page still shows the flight and when the order is
      // due, so it gets the "open" shape instead of a 404.
      const flight = await this.db.flight.findUnique({
        where: { id: flightId },
        include: { route: true, flight_report: true },
      })
      if (!flight) throw new ApiErrorException('NOT_FOUND', 'Flight not found.', 404)
      const summary = await this.passengerSummary([flightId])
      return this.openOrder(flight, summary.get(flightId)?.passengers ?? 0, await this.cutoffFor(flightId), flight.flight_report != null)
    }
    const passengers = await this.passengerSummary([flightId])
    const summary = passengers.get(flightId)
    return {
      id: order.id,
      flightId: order.flight_id,
      flightNumber: order.flight.flight_number,
      routeId: order.flight.route_id,
      route: `${order.flight.route.origin} → ${order.flight.route.destination}`,
      departureAirport: order.flight.route.origin,
      arrivalAirport: order.flight.route.destination,
      scheduledDeparture: order.flight.scheduled_dep_at.toISOString(),
      passengerCount: summary?.passengers ?? 0,
      status: order.status as CateringOrderDto['status'],
      cutoffAt: order.cutoff_at.toISOString(),
      generatedAt: order.generated_at.toISOString(),
      loadedAt: order.loaded_at ? order.loaded_at.toISOString() : null,
      warehouseId: order.warehouse_id,
      aircraftId: order.flight.aircraft_id,
      cabin: 'economy',
      lines: order.catering_order_line.map((l) => ({
        id: l.id,
        cabin: l.cabin,
        productId: l.product_id,
        productName: l.product.name,
        quantityRequired: l.quantity_required,
        quantityShort: l.quantity_short,
        source: l.source as 'order' | 'default',
      })),
      reportSubmitted: order.flight.flight_report != null,
    }
  }

  // Staff refresh: re-count the order against the current stock. The
  // order only exists after the cutoff, so a refresh before it is
  // refused with ORDER_NOT_YET_DUE.
  async refresh(flightId: string, staffId: string): Promise<CateringOrderDto> {
    const cutoff = await this.cutoffFor(flightId)
    const now = this.clock.now()
    if (now.getTime() < cutoff.getTime()) {
      throw new ApiErrorException('ORDER_NOT_YET_DUE', 'The catering order is generated at the cutoff.', 409, {
        cutoffAt: cutoff.toISOString(),
      })
    }
    return this.generate(flightId, staffId)
  }

  // The generation core, shared by the scheduled job (staffId null)
  // and the staff refresh (staffId set). It is idempotent: the lines
  // are replaced, so calling it twice leaves the same order.
  async generate(flightId: string, staffId: string | null): Promise<CateringOrderDto> {
    const flight = await this.db.flight.findUnique({ where: { id: flightId } })
    if (!flight) throw new ApiErrorException('NOT_FOUND', 'Flight not found.', 404)
    if (flight.status === 'cancelled') {
      throw new ApiErrorException('CATERING_VOID', 'Cannot generate a catering order for a cancelled flight.', 409)
    }
    const existing = await this.db.catering_order.findUnique({ where: { flight_id: flightId } })
    if (existing && (existing.status === 'loaded' || existing.status === 'closed')) {
      throw new ApiErrorException('CATERING_CLOSED', 'Catering order is already loaded or closed.', 409)
    }

    const cutoffAt = await this.cutoffFor(flightId)
    const resolved = await this.cabinSettings.resolveAllForFlight(flightId)
    const warehouse = await this.flightContext.warehouseForFlight(flightId)
    const lines = await this.buildLines(flightId, flight.route_id, warehouse.id, resolved)

    const now = this.clock.now()
    await this.db.$transaction(async (tx) => {
      let row
      if (existing) {
        await tx.catering_order_line.deleteMany({ where: { catering_order_id: existing.id } })
        row = await tx.catering_order.update({
          where: { id: existing.id },
          data: {
            status: 'generated',
            cutoff_at: cutoffAt,
            generated_at: now,
            generated_by_staff_id: staffId,
            warehouse_id: warehouse.id,
          },
        })
      } else {
        row = await tx.catering_order.create({
          data: {
            flight_id: flightId,
            warehouse_id: warehouse.id,
            status: 'generated',
            cutoff_at: cutoffAt,
            generated_at: now,
            generated_by_staff_id: staffId,
          },
        })
      }
      if (lines.length > 0) {
        await tx.catering_order_line.createMany({
          data: lines.map((l) => ({
            catering_order_id: row.id,
            cabin: l.cabin,
            product_id: l.productId,
            quantity_required: l.quantityRequired,
            quantity_short: l.quantityShort,
            source: l.source,
          })),
        })
      }
      await this.audit.record(
        {
          actorType: staffId ? 'staff' : 'system',
          actorId: staffId,
          actorRole: staffId ? 'catering' : null,
          sourceFeature: 'onboard-products',
          action: 'catering_order.refresh',
          entityType: 'catering_order',
          entityId: row.id,
          summary: `Generated catering order for flight ${flightId}: ${lines.length} line(s).`,
        },
        tx,
      )
    })
    return this.get(flightId)
  }

  // Mark the order loaded, after the stock transfer. Idempotent.
  async markLoaded(flightId: string, staffId: string): Promise<CateringOrderDto> {
    const order = await this.db.catering_order.findUnique({ where: { flight_id: flightId } })
    if (!order) throw new ApiErrorException('NOT_FOUND', 'Catering order not found.', 404)
    if (order.status === 'loaded') return this.get(flightId)
    if (order.status === 'closed' || order.status === 'void') {
      throw new ApiErrorException('CATERING_CLOSED', 'Catering order is already closed or voided.', 409)
    }
    const now = this.clock.now()
    await this.db.catering_order.update({
      where: { id: order.id },
      data: { status: 'loaded', loaded_at: now },
    })
    await this.audit.record({
      actorType: 'staff',
      actorId: staffId,
      actorRole: 'catering',
      sourceFeature: 'onboard-products',
      action: 'catering_order.load',
      entityType: 'catering_order',
      entityId: order.id,
      summary: `Marked the catering order for flight ${flightId} as loaded.`,
    })
    return this.get(flightId)
  }

  // Close the catering order (called by the flight report). Idempotent.
  async close(flightId: string, staffId: string): Promise<CateringOrderDto> {
    void staffId
    const order = await this.db.catering_order.findUnique({ where: { flight_id: flightId } })
    if (!order) throw new ApiErrorException('NOT_FOUND', 'Catering order not found.', 404)
    if (order.status === 'closed') return this.get(flightId)
    if (order.status === 'void') {
      throw new ApiErrorException('CATERING_VOID', 'Catering order is voided.', 409)
    }
    await this.db.catering_order.update({
      where: { id: order.id },
      data: { status: 'closed', closed_at: this.clock.now() },
    })
    return this.get(flightId)
  }

  // Void a catering order that has not yet been loaded.
  async void(flightId: string, staffId: string): Promise<CateringOrderDto> {
    const order = await this.db.catering_order.findUnique({ where: { flight_id: flightId } })
    if (!order) throw new ApiErrorException('NOT_FOUND', 'Catering order not found.', 404)
    if (order.status === 'loaded' || order.status === 'closed') {
      throw new ApiErrorException('CATERING_VOID', 'Cannot void a loaded or closed catering order.', 409)
    }
    await this.db.catering_order.update({ where: { id: order.id }, data: { status: 'void' } })
    await this.audit.record({
      actorType: 'staff',
      actorId: staffId,
      actorRole: 'catering',
      sourceFeature: 'onboard-products',
      action: 'catering_order.void',
      entityType: 'catering_order',
      entityId: order.id,
      summary: `Voided catering order for flight ${flightId}.`,
    })
    return this.get(flightId)
  }

  // -- helpers --------------------------------------------------------------

  // The shape of a flight that has no catering order yet: the order
  // is generated at the cutoff.
  private openOrder(
    flight: {
      id: string
      flight_number: string
      route_id: string
      scheduled_dep_at: Date
      aircraft_id: string
      route: { origin: string; destination: string }
    },
    passengerCount: number,
    cutoffAt: Date,
    reportSubmitted: boolean,
  ): CateringOrderDto {
    return {
      id: `open-${flight.id}`,
      flightId: flight.id,
      flightNumber: flight.flight_number,
      routeId: flight.route_id,
      route: `${flight.route.origin} → ${flight.route.destination}`,
      departureAirport: flight.route.origin,
      arrivalAirport: flight.route.destination,
      scheduledDeparture: flight.scheduled_dep_at.toISOString(),
      passengerCount,
      status: 'open',
      cutoffAt: cutoffAt.toISOString(),
      generatedAt: '',
      loadedAt: null,
      warehouseId: '',
      aircraftId: flight.aircraft_id,
      cabin: 'economy',
      lines: [],
      reportSubmitted,
    }
  }

  // The cutoff of a flight: the scheduled departure minus the
  // shortest order window among its cabins.
  async cutoffFor(flightId: string): Promise<Date> {
    const flight = await this.db.flight.findUnique({ where: { id: flightId } })
    if (!flight) throw new ApiErrorException('NOT_FOUND', 'Flight not found.', 404)
    const windowHours = await this.cabinSettings.orderWindowHoursForFlight(flightId)
    return new Date(flight.scheduled_dep_at.getTime() - windowHours * 3600 * 1000)
  }

  // The lines of a catering order: the paid customer orders plus the
  // default meal for the passengers who did not order one.
  private async buildLines(
    flightId: string,
    routeId: string,
    warehouseId: string,
    resolved: Record<F12Cabin, ResolvedCabinSetting>,
  ): Promise<LineDraft[]> {
    const orders = await this.db.product_order.findMany({
      where: { flight_id: flightId, status: 'confirmed' },
      include: { product_order_line: { where: { deleted_at: null } } },
    })

    const byKey = new Map<string, LineDraft>()
    const addLine = (cabin: string, productId: string, quantity: number, source: 'order' | 'default') => {
      const key = `${cabin}|${productId}|${source}`
      const current = byKey.get(key)
      if (current) {
        current.quantityRequired += quantity
        return
      }
      byKey.set(key, { cabin, productId, quantityRequired: quantity, quantityShort: 0, source })
    }

    // The paid customer orders.
    for (const order of orders) {
      for (const line of order.product_order_line) {
        addLine(order.cabin, line.product_id, line.quantity, 'order')
      }
    }

    // The default meal for the passengers who did not order one. Only
    // a complimentary cabin includes a meal.
    const summary = await this.passengerSummary([flightId])
    const passengers = summary.get(flightId)
    const defaults = await this.defaultOfferings(flightId, routeId)
    for (const cabin of CABINS) {
      const settings = resolved[cabin]
      if (settings.mealService !== 'complimentary') continue
      if (settings.includedPerPassenger <= 0) continue
      const productId = defaults.get(cabin)
      if (!productId) continue
      const counts = passengers?.perCabin.get(cabin)
      const withoutMeal = Math.max(0, (counts?.passengers ?? 0) - (counts?.ordered ?? 0))
      const required = withoutMeal * settings.includedPerPassenger
      if (required <= 0) continue
      addLine(cabin, productId, required, 'default')
    }

    // The shortfall against what the warehouse can actually give.
    const stockRows = await this.db.warehouse_stock.findMany({ where: { warehouse_id: warehouseId } })
    const available = new Map(stockRows.map((s) => [s.product_id, s.quantity_on_hand - s.quantity_reserved]))
    return [...byKey.values()].map((line) => ({
      ...line,
      quantityShort: Math.max(0, line.quantityRequired - (available.get(line.productId) ?? 0)),
    }))
  }

  // The default meal product per cabin, at the most specific level
  // that has rows for that cabin.
  private async defaultOfferings(flightId: string, routeId: string): Promise<Map<F12Cabin, string>> {
    const rows = await this.db.product_offering.findMany({
      where: { deleted_at: null, is_active: true },
      include: { product: true },
    })
    const mapped: OfferingRow[] = rows.map((r) => ({
      id: r.id,
      productId: r.product_id,
      scope: r.scope as OfferingRow['scope'],
      routeId: r.route_id,
      flightId: r.flight_id,
      cabin: r.cabin as F12Cabin,
      isDefault: r.is_default,
      isActive: r.is_active,
    }))
    const out = new Map<F12Cabin, string>()
    for (const cabin of CABINS) {
      const row = defaultOffering(mapped, { flightId, routeId, cabin })
      if (!row) continue
      const product = rows.find((r) => r.id === row.id)
      // Only a meal can be the default meal.
      if (product && product.product.category !== 'meal') continue
      out.set(cabin, row.productId)
    }
    return out
  }

  // The passengers on a flight: the passengers of the customers with a
  // paid order, plus the passengers who ordered a meal. F3b does not
  // ship a passenger manifest yet, so this is what F12 can see.
  private async passengerSummary(flightIds: string[]): Promise<Map<string, PassengerSummary>> {
    const out = new Map<string, PassengerSummary>()
    if (flightIds.length === 0) return out
    const orders = await this.db.product_order.findMany({
      where: { flight_id: { in: flightIds }, status: 'confirmed' },
      include: { product_order_line: { where: { deleted_at: null } } },
    })
    if (orders.length === 0) return out

    const customerIds = [...new Set(orders.map((o) => o.customer_id))]
    const links = await this.db.customer_passenger.findMany({
      where: { customer_id: { in: customerIds } },
      select: { customer_id: true, passenger_id: true },
    })
    const perCustomer = new Map<string, Set<string>>()
    for (const link of links) {
      const set = perCustomer.get(link.customer_id) ?? new Set<string>()
      set.add(link.passenger_id)
      perCustomer.set(link.customer_id, set)
    }

    const flightPassengers = new Map<string, Set<string>>()
    const flightOrdered = new Map<string, Set<string>>()
    const cabinPassengers = new Map<string, Set<string>>()
    const cabinOrdered = new Map<string, Set<string>>()
    for (const order of orders) {
      const passengers = flightPassengers.get(order.flight_id) ?? new Set<string>()
      const ordered = flightOrdered.get(order.flight_id) ?? new Set<string>()
      const cabinPeople = cabinPassengers.get(order.cabin) ?? new Set<string>()
      const cabinMeals = cabinOrdered.get(order.cabin) ?? new Set<string>()
      for (const passengerId of perCustomer.get(order.customer_id) ?? []) {
        passengers.add(passengerId)
        cabinPeople.add(passengerId)
      }
      for (const line of order.product_order_line) {
        if (line.category !== 'meal' || !line.booking_passenger_id) continue
        ordered.add(line.booking_passenger_id)
        cabinMeals.add(line.booking_passenger_id)
      }
      flightPassengers.set(order.flight_id, passengers)
      flightOrdered.set(order.flight_id, ordered)
      cabinPassengers.set(order.cabin, cabinPeople)
      cabinOrdered.set(order.cabin, cabinMeals)
    }

    for (const flightId of flightIds) {
      const passengers = flightPassengers.get(flightId) ?? new Set<string>()
      const ordered = flightOrdered.get(flightId) ?? new Set<string>()
      const perCabin = new Map<string, { passengers: number; ordered: number }>()
      for (const [cabin, people] of cabinPassengers) {
        const meals = cabinOrdered.get(cabin) ?? new Set<string>()
        perCabin.set(cabin, { passengers: people.size, ordered: Math.min(meals.size, people.size) })
      }
      out.set(flightId, {
        passengers: new Set([...passengers, ...ordered]).size,
        orderedMeals: ordered.size,
        perCabin,
      })
    }
    return out
  }
}

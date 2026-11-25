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
  // On hand at the order's warehouse right now (the doc's "in warehouse" column). Sent by the single-order view.
  quantityInWarehouse?: number
  source: 'order' | 'default'
}

export interface CateringOrderDto {
  id: string
  flightId: string
  flightNumber: string
  routeId: string
  route: string
  departureAirport: string
  // IANA zone of the departure airport, so staff see flight times in local time (like F2's pages).
  departureTimeZone?: string | null
  // The aircraft's registration (tail number), for display instead of its id.
  aircraftTailNumber?: string | null
  // True once the scheduled departure has passed on F12's clock.
  departed?: boolean
  arrivalAirport: string
  scheduledDeparture: string
  passengerCount: number
  status: 'open' | 'generated' | 'loaded' | 'closed' | 'void'
  // False once the cutoff has passed on F12's clock. A flight still 'open' with this false never got an order
  // (for example a flight from an airport F12 does not cater).
  orderingOpen?: boolean
  cutoffAt: string
  generatedAt: string
  loadedAt: string | null
  warehouseId: string
  aircraftId: string
  cabin: string
  lines: CateringOrderLineDto[]
  confirmedPreorders?: Array<{ cabin: string; productId: string; productName: string; quantity: number }>
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
    return this.withDisplayFields(await this.listUnzoned(filter))
  }

  async get(flightId: string): Promise<CateringOrderDto> {
    const order = await this.getUnzoned(flightId)
    const [dto] = await this.withDisplayFields([order])
    if (dto.status !== 'open' && dto.status !== 'generated') return dto
    return { ...dto, confirmedPreorders: await this.confirmedPreorders(flightId) }
  }

  private async confirmedPreorders(flightId: string): Promise<NonNullable<CateringOrderDto['confirmedPreorders']>> {
    const orders = await this.db.product_order.findMany({
      where: { flight_id: flightId, status: 'confirmed' },
      select: {
        cabin: true,
        product_order_line: {
          where: { deleted_at: null },
          select: { product_id: true, quantity: true, product: { select: { name: true } } },
        },
      },
    })
    const totals = new Map<string, NonNullable<CateringOrderDto['confirmedPreorders']>[number]>()
    for (const order of orders) {
      for (const line of order.product_order_line) {
        const key = `${order.cabin}:${line.product_id}`
        const total = totals.get(key)
        if (total) total.quantity += line.quantity
        else totals.set(key, { cabin: order.cabin, productId: line.product_id, productName: line.product.name, quantity: line.quantity })
      }
    }
    return [...totals.values()]
  }

  // Fills the display fields: the departure airport's time zone, the aircraft's tail number, and whether the flight
  // has departed on F12's clock. One query per table for the whole list.
  private async withDisplayFields(dtos: CateringOrderDto[]): Promise<CateringOrderDto[]> {
    const codes = [...new Set(dtos.map((d) => d.departureAirport))]
    const aircraftIds = [...new Set(dtos.map((d) => d.aircraftId).filter((id) => id))]
    const airports = await this.db.airport.findMany({ where: { iata_code: { in: codes } }, select: { iata_code: true, timezone: true } })
    const aircraft = await this.db.aircraft.findMany({ where: { id: { in: aircraftIds } }, select: { id: true, tail_number: true } })
    const zones = new Map<string, string>(airports.map((a) => [a.iata_code, a.timezone]))
    const tails = new Map<string, string>(aircraft.map((a) => [a.id, a.tail_number]))
    const now = this.clock.now().getTime()
    return dtos.map((d) => ({
      ...d,
      departureTimeZone: zones.get(d.departureAirport) ?? null,
      aircraftTailNumber: tails.get(d.aircraftId) ?? null,
      departed: new Date(d.scheduledDeparture).getTime() <= now,
    }))
  }

  private async listUnzoned(filter?: { from?: Date; to?: Date }): Promise<CateringOrderDto[]> {
    const flights = await this.db.flight.findMany({
      where: {
        OR: [
          { status: { in: ['scheduled', 'delayed', 'boarding', 'departed', 'holding', 'diverted', 'arrived', 'closed'] } },
          { status: 'cancelled', catering_order: { isNot: null } },
        ],
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
      orderBy: [{ scheduled_dep_at: 'desc' }, { id: 'asc' }],
    })
    const passengers = await this.passengerSummary(flights.map((f) => f.id))
    // A flight with no order yet needs its real cutoff (departure minus the shortest cabin window), not the
    // departure. The windows are resolved for every such flight in one query.
    const open = flights.filter((f) => !f.catering_order || f.catering_order.status === 'generated')
    const windows = await this.cabinSettings.orderWindowHoursForFlights(open)
    const cutoffs = new Map<string, Date>(
      open.map((f) => [f.id, new Date(f.scheduled_dep_at.getTime() - (windows.get(f.id) ?? 48) * 3600 * 1000)]),
    )
    return flights.map((flight) => {
      const order = flight.catering_order
      const summary = passengers.get(flight.id)
      const cutoff = order?.simulated_cutoff_at ?? cutoffs.get(flight.id) ?? flight.scheduled_dep_at
      if (!order || (order.status === 'generated' && this.clock.now().getTime() < cutoff.getTime())) {
        return {
          ...this.openOrder(flight, summary?.passengers ?? 0, cutoff, flight.flight_report != null),
          warehouseId: order?.warehouse_id ?? '',
        }
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

  private async getUnzoned(flightId: string): Promise<CateringOrderDto> {
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
    if (order.status === 'generated') {
      const cutoff = await this.cutoffFor(flightId)
      if (this.clock.now().getTime() < cutoff.getTime()) {
        const summary = await this.passengerSummary([flightId])
        return {
          ...this.openOrder(order.flight, summary.get(flightId)?.passengers ?? 0, cutoff, order.flight.flight_report != null),
          warehouseId: order.warehouse_id,
        }
      }
    }
    const passengers = await this.passengerSummary([flightId])
    const summary = passengers.get(flightId)
    const stock = await this.db.warehouse_stock.findMany({
      where: { warehouse_id: order.warehouse_id, product_id: { in: order.catering_order_line.map((l) => l.product_id) } },
      select: { product_id: true, quantity_on_hand: true },
    })
    const onHand = new Map(stock.map((s) => [s.product_id, s.quantity_on_hand]))
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
        quantityInWarehouse: onHand.get(l.product_id) ?? 0,
        source: l.source as 'order' | 'default',
      })),
      reportSubmitted: order.flight.flight_report != null,
    }
  }

  async assertTransferReady(flightId: string): Promise<void> {
    const order = await this.db.catering_order.findUnique({
      where: { flight_id: flightId },
      select: { status: true, generated_at: true },
    })
    if (order?.status !== 'generated') return
    const cutoff = await this.cutoffFor(flightId)
    if (this.clock.now() < cutoff) {
      throw new ApiErrorException('ORDER_NOT_YET_DUE', 'Stock can be transferred after ordering closes.', 409)
    }
    if (order.generated_at < cutoff) {
      const transfer = await this.db.stock_transfer.findFirst({ where: { flight_id: flightId }, select: { id: true } })
      if (!transfer) throw new ApiErrorException('ORDER_NOT_YET_DUE', 'Refresh the catering plan before transferring stock.', 409)
    }
  }

  async simulateClose(flightId: string, staffId: string): Promise<CateringOrderDto> {
    if (process.env.NODE_ENV !== 'development') {
      throw new ApiErrorException('NOT_FOUND', 'Ordering simulation is only available in development.', 404)
    }
    const order = await this.db.catering_order.findUnique({ where: { flight_id: flightId } })
    if (order?.simulated_cutoff_at) return this.get(flightId)
    const now = this.clock.now()
    if (now >= (await this.cutoffFor(flightId))) {
      throw new ApiErrorException('ORDER_WINDOW_CLOSED', 'Ordering has already closed for this flight.', 409)
    }
    return this.generate(flightId, staffId, now)
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

  // The generation core, shared by the scheduled job (staffId null,
  // first generation only) and the staff refresh (staffId set). The
  // lines are replaced; stock already transferred for the flight counts
  // as covered, so a refresh after the transfer does not turn it short.
  async generate(flightId: string, staffId: string | null, simulatedCutoff?: Date): Promise<CateringOrderDto> {
    const flight = await this.db.flight.findUnique({ where: { id: flightId } })
    if (!flight) throw new ApiErrorException('NOT_FOUND', 'Flight not found.', 404)
    if (flight.status === 'cancelled') {
      throw new ApiErrorException('CATERING_VOID', 'Cannot generate a catering order for a cancelled flight.', 409)
    }
    const existing = await this.db.catering_order.findUnique({ where: { flight_id: flightId } })
    if (existing?.status === 'void') {
      throw new ApiErrorException('CATERING_VOID', 'Catering order is voided.', 409)
    }
    if (existing && (existing.status === 'loaded' || existing.status === 'closed')) {
      throw new ApiErrorException('CATERING_CLOSED', 'Catering order is already loaded or closed.', 409)
    }

    const cutoffAt = existing?.simulated_cutoff_at ?? simulatedCutoff ?? (await this.cutoffFor(flightId))
    const resolved = await this.cabinSettings.resolveAllForFlight(flightId)
    const warehouse = await this.flightContext.warehouseForFlight(flightId)
    const lines = await this.buildLines(flightId, flight.route_id, warehouse.id, resolved)

    const now = this.clock.now()
    const simulation = simulatedCutoff ? { simulated_cutoff_at: cutoffAt } : {}
    await this.db.$transaction(async (tx) => {
      let row
      if (existing) {
        await tx.catering_order_line.deleteMany({ where: { catering_order_id: existing.id } })
        row = await tx.catering_order.update({
          where: { id: existing.id },
          data: {
            status: 'generated',
            cutoff_at: cutoffAt,
            ...simulation,
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
            ...simulation,
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
  // staffId is null when the scheduled job voids the order because F2
  // cancelled the flight.
  async void(flightId: string, staffId: string | null): Promise<CateringOrderDto> {
    const order = await this.db.catering_order.findUnique({ where: { flight_id: flightId } })
    if (!order) throw new ApiErrorException('NOT_FOUND', 'Catering order not found.', 404)
    if (order.status === 'loaded' || order.status === 'closed') {
      throw new ApiErrorException('CATERING_VOID', 'Cannot void a loaded or closed catering order.', 409)
    }
    if (order.status === 'void') return this.get(flightId)
    await this.db.catering_order.update({ where: { id: order.id }, data: { status: 'void' } })
    await this.audit.record({
      actorType: staffId ? 'staff' : 'system',
      actorId: staffId,
      actorRole: staffId ? 'catering' : null,
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
      orderingOpen: this.clock.now().getTime() < cutoffAt.getTime(),
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
    const order = await this.db.catering_order.findUnique({
      where: { flight_id: flightId },
      select: { simulated_cutoff_at: true },
    })
    if (order?.simulated_cutoff_at) return order.simulated_cutoff_at
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

    // The default meal (doc, ordering step 6). A complimentary cabin
    // plans the included meal for every passenger who ordered none. A
    // paid cabin plans a buffer of default meals for on-board sales:
    // onboard_buffer_percent of passengers without a confirmed meal, rounded up.
    const summary = await this.passengerSummary([flightId])
    const passengers = summary.get(flightId)
    const defaults = await this.defaultOfferings(flightId, routeId)
    for (const cabin of CABINS) {
      const settings = resolved[cabin]
      const productId = defaults.get(cabin)
      if (!productId) continue
      const counts = passengers?.perCabin.get(cabin)
      const withoutMeal = Math.max(0, (counts?.passengers ?? 0) - (counts?.ordered ?? 0))
      let required = 0
      if (settings.mealService === 'complimentary') {
        required = withoutMeal * Math.max(0, settings.includedPerPassenger)
      } else if (settings.mealService === 'paid') {
        required = Math.ceil((withoutMeal * Math.max(0, settings.onboardBufferPercent ?? 0)) / 100)
      }
      if (required <= 0) continue
      addLine(cabin, productId, required, 'default')
    }

    // The shortfall (doc, step 7). The pool per product is what the
    // warehouse can still give, plus the stock this flight's paid orders
    // still hold (their reservation covers them, so it must not count
    // against them), plus what is already on the aircraft for this
    // flight (so a refresh after the transfer is not short). Lines share
    // the pool, so two lines cannot claim the same units.
    const stockRows = await this.db.warehouse_stock.findMany({ where: { warehouse_id: warehouseId } })
    const transferred = await this.db.stock_transfer_line.findMany({
      where: { stock_transfer: { flight_id: flightId } },
      select: { product_id: true, quantity: true },
    })
    const released = orders.length
      ? await this.db.stock_movement.findMany({
          where: { type: 'release', product_order_id: { in: orders.map((o) => o.id) } },
          select: { product_order_id: true, product_id: true },
        })
      : []
    const releasedKeys = new Set(released.map((r) => `${r.product_order_id}|${r.product_id}`))
    const pool = new Map(stockRows.map((s) => [s.product_id, Math.max(0, s.quantity_on_hand - s.quantity_reserved)]))
    const add = (productId: string, quantity: number) => pool.set(productId, (pool.get(productId) ?? 0) + quantity)
    for (const order of orders) {
      for (const line of order.product_order_line) {
        if (!releasedKeys.has(`${order.id}|${line.product_id}`)) add(line.product_id, line.quantity)
      }
    }
    // A held reservation cannot exceed what is physically on hand.
    const onHand = new Map(stockRows.map((s) => [s.product_id, s.quantity_on_hand]))
    for (const [productId, left] of pool) pool.set(productId, Math.min(left, onHand.get(productId) ?? 0))
    for (const t of transferred) add(t.product_id, t.quantity)
    return [...byKey.values()].map((line) => {
      const left = pool.get(line.productId) ?? 0
      pool.set(line.productId, Math.max(0, left - line.quantityRequired))
      return { ...line, quantityShort: Math.max(0, line.quantityRequired - left) }
    })
  }

  // The default meal product per cabin, at the most specific level
  // that has rows for that cabin.
  private async defaultOfferings(flightId: string, routeId: string): Promise<Map<F12Cabin, string>> {
    const rows = await this.db.product_offering.findMany({
      where: { deleted_at: null },
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

  // The passengers on each flight, per cabin, from F3b: every
  // non-infant passenger on a confirmed booking with a segment on the
  // flight (the doc: "confirmed passengers per flight"). "Ordered" is
  // the passengers among them with a meal on a paid order. Both sides
  // use booking_passenger ids, so the two counts line up.
  private async passengerSummary(flightIds: string[]): Promise<Map<string, PassengerSummary>> {
    const out = new Map<string, PassengerSummary>()
    if (flightIds.length === 0) return out
    const segments = await this.db.booking_segment.findMany({
      where: { flight_id: { in: flightIds }, booking: { status: 'confirmed' } },
      select: {
        flight_id: true,
        cabin: true,
        booking: { select: { booking_passenger: { where: { passenger_type: { not: 'infant' } }, select: { id: true } } } },
      },
    })
    const orders = await this.db.product_order.findMany({
      where: { flight_id: { in: flightIds }, status: 'confirmed' },
      include: { product_order_line: { where: { deleted_at: null, category: 'meal' } } },
    })

    const key = (flightId: string, cabin: string) => `${flightId}|${cabin}`
    const people = new Map<string, Set<string>>()
    for (const segment of segments) {
      const set = people.get(key(segment.flight_id, segment.cabin)) ?? new Set<string>()
      for (const p of segment.booking.booking_passenger) set.add(p.id)
      people.set(key(segment.flight_id, segment.cabin), set)
    }
    const withMeal = new Map<string, Set<string>>()
    for (const order of orders) {
      const set = withMeal.get(key(order.flight_id, order.cabin)) ?? new Set<string>()
      for (const line of order.product_order_line) {
        if (line.booking_passenger_id) set.add(line.booking_passenger_id)
      }
      withMeal.set(key(order.flight_id, order.cabin), set)
    }

    for (const flightId of flightIds) {
      const perCabin = new Map<string, { passengers: number; ordered: number }>()
      let passengers = 0
      let orderedMeals = 0
      for (const cabin of CABINS) {
        const onBoard = people.get(key(flightId, cabin)) ?? new Set<string>()
        const meals = withMeal.get(key(flightId, cabin)) ?? new Set<string>()
        const ordered = [...meals].filter((id) => onBoard.has(id)).length
        perCabin.set(cabin, { passengers: onBoard.size, ordered })
        passengers += onBoard.size
        orderedMeals += ordered
      }
      out.set(flightId, { passengers, orderedMeals, perCabin })
    }
    return out
  }
}

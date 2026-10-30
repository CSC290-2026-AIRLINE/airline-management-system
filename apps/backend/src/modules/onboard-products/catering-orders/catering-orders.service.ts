// CateringOrdersService: per-flight catering order lifecycle.
// refresh = regenerate lines (replace existing) from current cabin
// settings and aircraft capacity. load = transfer the lines to the
// aircraft (creates a stock_transfer + aircraft_stock + stock_movements).
// close = end-of-flight wrap (called from flight-report submit).
// void = cancel an order that has not been loaded yet.

import { Injectable } from '@nestjs/common'
import { DbService } from '../../../db/db.service'
import { ApiErrorException } from '../common/api-error'
import { AuditService } from '../common/audit.service'
import { CabinSettingsService } from '../cabin-settings/cabin-settings.service'
import { SystemClock } from '../common/clock'
import type { F12Cabin } from '../common/mapping'
import { StockTransfersService } from '../stock-transfers/stock-transfers.service'

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
}

const VALID_CABINS: F12Cabin[] = ['economy', 'premium_economy', 'business', 'first']

@Injectable()
export class CateringOrdersService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
    private readonly clock: SystemClock,
    private readonly cabinSettings: CabinSettingsService,
    private readonly transfers: StockTransfersService,
  ) {}

  // List all catering orders for the picker. Flights without an
  // order yet are reported with status='open' and a synthetic id so
  // the left-list can render them.
  async listOpenAndOrdered(): Promise<CateringOrderDto[]> {
    const flights = await this.db.flight.findMany({
      where: { status: { in: ['scheduled', 'boarding', 'departed', 'arrived', 'closed'] } },
      include: {
        route: { include: { airport_route_originToairport: true, airport_route_destinationToairport: true } },
        catering_order: { include: { catering_order_line: { include: { product: true } } } },
      },
      orderBy: { scheduled_dep_at: 'asc' },
    })
    const out: CateringOrderDto[] = []
    for (const flight of flights) {
      const order = flight.catering_order
      if (!order) {
        out.push({
          id: `open-${flight.id}`,
          flightId: flight.id,
          flightNumber: flight.flight_number,
          routeId: flight.route_id,
          route: `${flight.route.origin} → ${flight.route.destination}`,
          departureAirport: flight.route.origin,
          arrivalAirport: flight.route.destination,
          scheduledDeparture: flight.scheduled_dep_at.toISOString(),
          passengerCount: 0,
          status: 'open',
          cutoffAt: flight.scheduled_dep_at.toISOString(),
          generatedAt: '',
          loadedAt: null,
          warehouseId: '',
          aircraftId: flight.aircraft_id,
          cabin: 'economy',
          lines: [],
        })
      } else {
        out.push({
          id: order.id,
          flightId: flight.id,
          flightNumber: flight.flight_number,
          routeId: flight.route_id,
          route: `${flight.route.origin} → ${flight.route.destination}`,
          departureAirport: flight.route.origin,
          arrivalAirport: flight.route.destination,
          scheduledDeparture: flight.scheduled_dep_at.toISOString(),
          passengerCount: 0,
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
        })
      }
    }
    return out
  }

  async get(flightId: string): Promise<CateringOrderDto> {
    const order = await this.db.catering_order.findUnique({
      where: { flight_id: flightId },
      include: {
        catering_order_line: { include: { product: true } },
        flight: { include: { route: { include: { airport_route_originToairport: true, airport_route_destinationToairport: true } } } },
      },
    })
    if (!order) throw new ApiErrorException('NOT_FOUND', 'Catering order not found.', 404)
    return {
      id: order.id,
      flightId: order.flight_id,
      flightNumber: order.flight.flight_number,
      routeId: order.flight.route_id,
      route: `${order.flight.route.origin} → ${order.flight.route.destination}`,
      departureAirport: order.flight.route.origin,
      arrivalAirport: order.flight.route.destination,
      scheduledDeparture: order.flight.scheduled_dep_at.toISOString(),
      passengerCount: 0,
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
    }
  }

  // Generate (or regenerate) a catering order for a flight. Uses the
  // effective cabin settings + the product offering rows to compute
  // quantity_required per (cabin, product). quantity_short is the
  // shortage vs. the available stock at the assigned warehouse.
  async refresh(flightId: string, staffId: string): Promise<CateringOrderDto> {
    const flight = await this.db.flight.findUnique({ where: { id: flightId } })
    if (!flight) throw new ApiErrorException('NOT_FOUND', 'Flight not found.', 404)
    if (flight.status === 'cancelled') {
      throw new ApiErrorException('CATERING_VOID', 'Cannot refresh a cancelled flight.', 409)
    }
    const existing = await this.db.catering_order.findUnique({ where: { flight_id: flightId } })
    if (existing && existing.status === 'loaded') {
      throw new ApiErrorException('CATERING_CLOSED', 'Catering order is already loaded.', 409)
    }
    if (existing && existing.status === 'closed') {
      throw new ApiErrorException('CATERING_CLOSED', 'Catering order is already closed.', 409)
    }
    const windowHours = await this.cabinSettings.orderWindowHoursForFlight(flightId)
    const cutoffAt = new Date(flight.scheduled_dep_at.getTime() - windowHours * 3600 * 1000)
    const resolved = await this.cabinSettings.resolveAllForFlight(flightId)
    // Pick the warehouse at the origin airport. If the airport has no
    // warehouse, fall back to the first warehouse in the network and
    // raise NO_WAREHOUSE_FOR_AIRPORT when a strict flag is added; for
    // now we accept the fallback.
    const origin = (await this.db.route.findUnique({ where: { id: flight.route_id } }))?.origin ?? null
    let warehouse = origin ? await this.db.warehouse.findFirst({ where: { airport_code: origin, deleted_at: null } }) : null
    if (!warehouse) warehouse = await this.db.warehouse.findFirst({ where: { deleted_at: null }, orderBy: { code: 'asc' } })
    if (!warehouse) throw new ApiErrorException('NO_WAREHOUSE_FOR_AIRPORT', 'No warehouse is available for this flight.', 409)

    // For each cabin that is meal-service-enabled, expand the default
    // offerings for that cabin into order lines. quantity_required =
    // max(included_per_passenger, passengers_in_cabin) * 1 (we only
    // surface the included meal count here).
    const offerings = await this.db.product_offering.findMany({
      where: { deleted_at: null, is_active: true, is_default: true },
      include: { product: true },
    })

    // Build line list scoped to this flight: pick the most specific
    // default offering per (cabin). For simplicity, filter to the
    // route/flight rows for this flight, falling back to network.
    const scoped = offerings.filter(
      (o) =>
        o.scope === 'network' ||
        (o.scope === 'route' && o.route_id === flight.route_id) ||
        (o.scope === 'flight' && o.flight_id === flightId),
    )
    const stockRows = await this.db.warehouse_stock.findMany({ where: { warehouse_id: warehouse.id } })
    const stockByProduct = new Map(stockRows.map((s) => [s.product_id, s.quantity_on_hand - s.quantity_reserved]))

    const lines: Array<{ cabin: string; productId: string; quantityRequired: number; quantityShort: number; source: 'order' | 'default' }> =
      []
    const used = new Set<string>()
    for (const cabin of VALID_CABINS) {
      const settings = resolved[cabin]
      if (settings.mealService === 'none') continue
      if (settings.mealService === 'complimentary' && settings.includedPerPassenger > 0) {
        // Pick the route/flight default meal for this cabin if present,
        // else network default.
        const candidate = pickDefaultOffering(scoped, cabin, flight.route_id, flightId)
        if (candidate) {
          const required = settings.includedPerPassenger * 100 // passenger count is a stand-in for now
          const available = stockByProduct.get(candidate.product_id) ?? 0
          const short = Math.max(0, required - available)
          const key = `${cabin}|${candidate.product_id}|default`
          if (!used.has(key)) {
            used.add(key)
            lines.push({ cabin, productId: candidate.product_id, quantityRequired: required, quantityShort: short, source: 'default' })
          }
        }
      }
    }
    const now = this.clock.now()
    const order = await this.db.$transaction(async (tx) => {
      let row
      if (existing) {
        await tx.catering_order_line.deleteMany({ where: { catering_order_id: existing.id } })
        row = await tx.catering_order.update({
          where: { id: existing.id },
          data: { status: 'generated', cutoff_at: cutoffAt, generated_at: now, generated_by_staff_id: staffId, warehouse_id: warehouse.id },
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
          // The (catering_order_id, cabin, product_id, source) unique
          // would clash if we already had these lines; deleteMany above
          // already wiped them.
        })
      }
      await this.audit.record(
        {
          actorType: 'staff',
          actorId: staffId,
          actorRole: 'catering',
          sourceFeature: 'onboard-products',
          action: 'catering_order.refresh',
          entityType: 'catering_order',
          entityId: row.id,
          summary: `Refreshed catering order for flight ${flightId}: ${lines.length} line(s).`,
        },
        tx,
      )
      return row
    })
    return this.get(order.flight_id)
  }

  // Load the catering order: transfer each line from the warehouse
  // to the aircraft, creating aircraft_stock and stock_movements.
  // Idempotent: returns the existing loaded order if already loaded.
  async load(flightId: string, staffId: string): Promise<CateringOrderDto> {
    const order = await this.db.catering_order.findUnique({
      where: { flight_id: flightId },
      include: { catering_order_line: true, flight: true },
    })
    if (!order) throw new ApiErrorException('NOT_FOUND', 'Catering order not found.', 404)
    if (order.status === 'loaded') return this.get(flightId)
    if (order.status === 'closed' || order.status === 'void') {
      throw new ApiErrorException('CATERING_CLOSED', 'Catering order is already closed or voided.', 409)
    }
    const now = this.clock.now()
    const lines = order.catering_order_line
    // Translate (cabin, product) -> required quantity. We group across
    // cabins to push one transfer per (product, batch) on the aircraft.
    const grouped = new Map<string, number>()
    for (const l of lines) {
      grouped.set(l.product_id, (grouped.get(l.product_id) ?? 0) + l.quantity_required)
    }
    await this.transfers.transferToAircraft({
      flightId,
      aircraftId: order.flight.aircraft_id,
      warehouseId: order.warehouse_id,
      lines: [...grouped.entries()].map(([productId, quantity]) => ({ productId, quantity })),
      staffId,
      occurredAt: now,
    })
    await this.db.catering_order.update({
      where: { id: order.id },
      data: { status: 'loaded', loaded_at: now },
    })
    return this.get(flightId)
  }

  // Close the catering order (called by flight-report submit). Idempotent.
  async close(flightId: string, staffId: string): Promise<CateringOrderDto> {
    void staffId
    const order = await this.db.catering_order.findUnique({ where: { flight_id: flightId } })
    if (!order) throw new ApiErrorException('NOT_FOUND', 'Catering order not found.', 404)
    if (order.status === 'closed') return this.get(flightId)
    if (order.status === 'void') {
      throw new ApiErrorException('CATERING_VOID', 'Catering order is voided.', 409)
    }
    const now = this.clock.now()
    await this.db.catering_order.update({ where: { id: order.id }, data: { status: 'closed', closed_at: now } })
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
}

function pickDefaultOffering(
  scoped: Array<{
    scope: string
    route_id: string | null
    flight_id: string | null
    cabin: string
    product_id: string
    is_default: boolean
    product: { category: string }
  }>,
  cabin: F12Cabin,
  routeId: string,
  flightId: string,
): { product_id: string } | null {
  // Order: flight > route > network. Only meals.
  const eligible = scoped.filter((o) => o.cabin === cabin && o.is_default && o.product.category === 'meal')
  const flightRow = eligible.find((o) => o.scope === 'flight' && o.flight_id === flightId)
  if (flightRow) return { product_id: flightRow.product_id }
  const routeRow = eligible.find((o) => o.scope === 'route' && o.route_id === routeId)
  if (routeRow) return { product_id: routeRow.product_id }
  const netRow = eligible.find((o) => o.scope === 'network')
  if (netRow) return { product_id: netRow.product_id }
  return null
}

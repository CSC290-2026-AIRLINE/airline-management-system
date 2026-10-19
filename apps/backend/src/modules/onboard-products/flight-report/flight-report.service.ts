// FlightReportService: per-flight report. The "initial" column is
// derived from the flight's aircraft stock at submit time. The
// validation enforces remaining >= 0 for every line. After validation
// we apply the completion rules (meals -> discard all, snacks/bevs/
// duty-free only discard damaged or expired) and close the catering
// order. product_sale.unit_cost_amount is filled from the earliest
// valid aircraft batch for each sold product.

import { Injectable } from '@nestjs/common'
import { DbService } from '../../../db/db.service'
import { ApiErrorException } from '../common/api-error'
import { AuditService } from '../common/audit.service'
import { SystemClock } from '../common/clock'
import { applyCompletionRule, type F12ProductCategory } from '../common/mapping'
import { SalesService } from '../sales/sales.service'
import { CateringOrdersService } from '../catering-orders/catering-orders.service'

export interface FlightReportLineDto {
  id: string
  productId: string
  productName: string
  initialQuantity: number
  served: number
  sold: number
  wasted: number
  damaged: number
  remaining: number
}

export interface FlightReportDto {
  id: string
  flightId: string
  flightNumber: string
  route: string
  status: 'submitted' | 'void'
  submittedAt: string | null
  lines: FlightReportLineDto[]
}

export interface SubmitFlightReportLineInput {
  productId: string
  served: number
  wasted: number
  damaged: number
}

export interface SubmitFlightReportInput {
  lines: SubmitFlightReportLineInput[]
}

@Injectable()
export class FlightReportService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
    private readonly clock: SystemClock,
    private readonly sales: SalesService,
    private readonly cateringOrders: CateringOrdersService,
  ) {}

  async getByFlight(flightId: string): Promise<FlightReportDto | null> {
    const row = await this.db.flight_report.findUnique({
      where: { flight_id: flightId },
      include: {
        flight: { include: { route: true } },
        flight_report_line: { include: { product: true } },
      },
    })
    if (!row) return null
    return {
      id: row.id,
      flightId: row.flight_id,
      flightNumber: row.flight.flight_number,
      route: `${row.flight.route.origin} → ${row.flight.route.destination}`,
      status: row.status as 'submitted' | 'void',
      submittedAt: row.submitted_at ? row.submitted_at.toISOString() : null,
      lines: row.flight_report_line.map((l) => ({
        id: l.id,
        productId: l.product_id,
        productName: l.product.name,
        initialQuantity: l.initial_quantity,
        served: l.served,
        sold: l.sold,
        wasted: l.wasted,
        damaged: l.damaged,
        remaining: l.remaining,
      })),
    }
  }

  // List reportable flights (status in {loaded, closed}, or has a
  // catering order that is loaded / closed). The picker in the
  // staff-web uses this to populate the chips.
  async listReportableFlights(): Promise<
    Array<{
      id: string
      flightNumber: string
      departureAirport: string
      arrivalAirport: string
      scheduledDeparture: string
      aircraftId: string
      reportSubmitted: boolean
    }>
  > {
    const flights = await this.db.flight.findMany({
      where: { catering_order: { status: { in: ['loaded', 'closed'] } } },
      include: { route: true, flight_report: true, catering_order: true },
      orderBy: { scheduled_dep_at: 'asc' },
    })
    return flights.map((f) => ({
      id: f.id,
      flightNumber: f.flight_number,
      departureAirport: f.route.origin,
      arrivalAirport: f.route.destination,
      scheduledDeparture: f.scheduled_dep_at.toISOString(),
      aircraftId: f.aircraft_id,
      reportSubmitted: f.flight_report != null,
    }))
  }

  async submit(flightId: string, input: SubmitFlightReportInput, staffId: string): Promise<FlightReportDto> {
    const existing = await this.db.flight_report.findUnique({ where: { flight_id: flightId } })
    if (existing) throw new ApiErrorException('REPORT_ALREADY_SUBMITTED', 'This flight already has a submitted report.', 409)
    const flight = await this.db.flight.findUnique({
      where: { id: flightId },
      include: { route: { include: { airport_route_originToairport: true, airport_route_destinationToairport: true } } },
    })
    if (!flight) throw new ApiErrorException('NOT_FOUND', 'Flight not found.', 404)
    const aircraft_stock = await this.db.aircraft_stock.findMany({
      where: { aircraft_id: flight.aircraft_id, quantity: { gt: 0 } },
      include: { stock_batch: { include: { product: true } } },
    })
    // Group aircraft stock by product; initial = sum of quantities.
    const initialByProduct = new Map<string, { quantity: number; product: { id: string; name: string; category: string } }>()
    for (const row of aircraft_stock) {
      const prev = initialByProduct.get(row.product_id)
      if (prev) prev.quantity += row.quantity
      else
        initialByProduct.set(row.product_id, {
          quantity: row.quantity,
          product: { id: row.product_id, name: row.stock_batch.product.name, category: row.stock_batch.product.category },
        })
    }
    // Compute sold totals from product_sale.
    const sales = await this.db.product_sale.findMany({ where: { flight_id: flightId } })
    const soldByProduct = new Map<string, number>()
    for (const s of sales) soldByProduct.set(s.product_id, (soldByProduct.get(s.product_id) ?? 0) + s.quantity)
    // Validate every input line.
    for (const line of input.lines) {
      if (!Number.isInteger(line.served) || line.served < 0) {
        throw new ApiErrorException('REPORT_INVALID', 'served must be a non-negative integer.', 400)
      }
      if (!Number.isInteger(line.wasted) || line.wasted < 0) {
        throw new ApiErrorException('REPORT_INVALID', 'wasted must be a non-negative integer.', 400)
      }
      if (!Number.isInteger(line.damaged) || line.damaged < 0) {
        throw new ApiErrorException('REPORT_INVALID', 'damaged must be a non-negative integer.', 400)
      }
      const initial = initialByProduct.get(line.productId)?.quantity ?? 0
      const sold = soldByProduct.get(line.productId) ?? 0
      const remaining = initial - line.served - sold - line.wasted - line.damaged
      if (remaining < 0) {
        throw new ApiErrorException(
          'REPORT_MISMATCH',
          `${initialByProduct.get(line.productId)?.product.name ?? line.productId}: remaining would be ${remaining} (served + sold + wasted + damaged exceeds initial).`,
          409,
        )
      }
    }
    // Apply completion rules and write everything in one transaction.
    const now = this.clock.now()
    return this.db
      .$transaction(async (tx) => {
        const report = await tx.flight_report.create({
          data: {
            flight_id: flightId,
            status: 'submitted',
            submitted_by_staff_id: staffId,
            submitted_at: now,
          },
        })
        for (const line of input.lines) {
          const initial = initialByProduct.get(line.productId)?.quantity ?? 0
          const sold = soldByProduct.get(line.productId) ?? 0
          const remaining = initial - line.served - sold - line.wasted - line.damaged
          const product = initialByProduct.get(line.productId)?.product
          await tx.flight_report_line.create({
            data: {
              flight_report_id: report.id,
              product_id: line.productId,
              initial_quantity: initial,
              served: line.served,
              sold,
              wasted: line.wasted,
              damaged: line.damaged,
              remaining,
            },
          })
          // Apply completion rules to aircraft stock.
          const category = (product?.category ?? 'meal') as F12ProductCategory
          const totalOnAircraft = initial
          const stockRows = aircraft_stock.filter((r) => r.product_id === line.productId)
          let hasValidBatch = false
          let discardQty = 0
          for (const r of stockRows) {
            const valid = !r.stock_batch.is_damaged && (!r.stock_batch.expires_at || r.stock_batch.expires_at > now)
            if (valid) hasValidBatch = true
          }
          const rule = applyCompletionRule({ category, totalOnAircraft, hasValidBatch })
          if (rule.discardQty > 0) {
            // For meals: discard the full quantity on the aircraft, write
            // one discard movement per product. For snacks/bevs: only
            // discard the rows that are not valid.
            for (const r of stockRows) {
              const valid = !r.stock_batch.is_damaged && (!r.stock_batch.expires_at || r.stock_batch.expires_at > now)
              if (category === 'meal' || !valid) {
                discardQty += r.quantity
                await tx.aircraft_stock.update({ where: { id: r.id }, data: { quantity: 0 } })
                await tx.stock_movement.create({
                  data: {
                    product_id: r.product_id,
                    aircraft_id: r.aircraft_id,
                    stock_batch_id: r.stock_batch_id,
                    flight_id: flightId,
                    type: 'discard',
                    quantity: -r.quantity,
                    reason: category === 'meal' ? null : r.stock_batch.is_damaged ? 'damage' : 'expired',
                    note: `flight report submit (${rule.afterLabel})`,
                    created_by_staff_id: staffId,
                    occurred_at: now,
                  },
                })
              }
            }
          }
          void discardQty
        }
        await this.audit.record(
          {
            actorType: 'staff',
            actorId: staffId,
            actorRole: 'catering',
            sourceFeature: 'onboard-products',
            action: 'flight_report.submit',
            entityType: 'flight_report',
            entityId: report.id,
            summary: `Submitted flight report for flight ${flightId}: ${input.lines.length} line(s).`,
          },
          tx,
        )
        return report
      })
      .then(async (report) => {
        // Fill unit costs on every sale and close the catering order.
        await this.sales.fillUnitCosts(flightId, flight.aircraft_id)
        try {
          await this.cateringOrders.close(flightId, staffId)
        } catch {
          /* catering order might not exist; ignore */
        }
        const fresh = await this.getByFlight(flightId)
        return (
          fresh ?? {
            id: report.id,
            flightId,
            flightNumber: flight.flight_number,
            route: `${flight.route.origin} → ${flight.route.destination}`,
            status: 'submitted' as const,
            submittedAt: now.toISOString(),
            lines: [],
          }
        )
      })
  }
}

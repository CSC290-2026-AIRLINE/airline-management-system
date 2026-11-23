// Flight reports use the load transferred for that flight, even when the aircraft serves several flights.

import { Injectable } from '@nestjs/common'
import { DbService } from '../../../db/db.service'
import { ApiErrorException } from '../common/api-error'
import { AuditService } from '../common/audit.service'
import { SystemClock } from '../common/clock'
import type { Prisma } from '../../../db/generated/prisma/client'

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
      routeId: string
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
      routeId: f.route_id,
      departureAirport: f.route.origin,
      arrivalAirport: f.route.destination,
      scheduledDeparture: f.scheduled_dep_at.toISOString(),
      aircraftId: f.aircraft_id,
      reportSubmitted: f.flight_report != null,
    }))
  }

  async listLoadedProducts(flightId: string): Promise<Array<{ productId: string; quantity: number }>> {
    const rows = await this.db.stock_transfer_line.groupBy({
      by: ['product_id'],
      where: { stock_transfer: { flight_id: flightId } },
      _sum: { quantity: true },
    })
    return rows.map((row) => ({ productId: row.product_id, quantity: row._sum.quantity ?? 0 }))
  }

  async submit(flightId: string, input: SubmitFlightReportInput, staffId: string): Promise<FlightReportDto> {
    const now = this.clock.now()
    await this.db.$transaction(async (tx) => {
      const flight = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM flight WHERE id = ${flightId}::uuid FOR UPDATE`
      if (!flight.length) throw new ApiErrorException('NOT_FOUND', 'Flight not found.', 404)
      if (await tx.flight_report.findUnique({ where: { flight_id: flightId } })) {
        throw new ApiErrorException('REPORT_ALREADY_SUBMITTED', 'This flight already has a submitted report.', 409)
      }
      const order = await tx.catering_order.findUnique({ where: { flight_id: flightId } })
      if (order?.status !== 'loaded') {
        throw new ApiErrorException('REPORT_INVALID', 'Load the catering order before submitting the flight report.', 409)
      }
      const transfers = await tx.stock_transfer_line.findMany({
        where: { stock_transfer: { flight_id: flightId } },
        include: { stock_transfer: { select: { aircraft_id: true } }, stock_batch: { include: { product: true } } },
        orderBy: [{ stock_batch: { expires_at: 'asc' } }, { stock_batch: { received_at: 'asc' } }, { id: 'asc' }],
      })
      const byProduct = new Map<string, typeof transfers>()
      for (const row of transfers) {
        const current = byProduct.get(row.product_id) ?? []
        current.push(row)
        byProduct.set(row.product_id, current)
      }
      const seen = new Set(input.lines.map((line) => line.productId))
      if (seen.size !== input.lines.length || seen.size !== byProduct.size || [...seen].some((id) => !byProduct.has(id))) {
        throw new ApiErrorException('REPORT_INVALID', 'Enter one report line for every product loaded on this flight.', 400)
      }

      const sales = await tx.product_sale.groupBy({ by: ['product_id'], where: { flight_id: flightId }, _sum: { quantity: true } })
      const soldByProduct = new Map(sales.map((row) => [row.product_id, row._sum.quantity ?? 0]))
      const report = await tx.flight_report.create({
        data: { flight_id: flightId, status: 'submitted', submitted_by_staff_id: staffId, submitted_at: now },
      })
      for (const line of input.lines) {
        if (![line.served, line.wasted, line.damaged].every((quantity) => Number.isInteger(quantity) && quantity >= 0)) {
          throw new ApiErrorException('REPORT_INVALID', 'Served, wasted and damaged must be non-negative integers.', 400)
        }
        const loads = byProduct.get(line.productId)!
        const initial = loads.reduce((sum, row) => sum + row.quantity, 0)
        const sold = soldByProduct.get(line.productId) ?? 0
        const remaining = initial - line.served - sold - line.wasted - line.damaged
        const product = loads[0].stock_batch.product
        if (remaining < 0) {
          throw new ApiErrorException(
            'REPORT_MISMATCH',
            `${product.name}: entered quantities exceed the ${initial} units loaded for this flight.`,
            409,
          )
        }
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
        if (sold > 0) {
          const cost = loads.find((row) => !row.stock_batch.is_damaged)?.stock_batch.unit_cost_amount ?? product.purchase_cost_amount
          await tx.product_sale.updateMany({ where: { flight_id: flightId, product_id: line.productId }, data: { unit_cost_amount: cost } })
        }

        let consumed = line.served + sold
        let damaged = line.damaged
        let wasted = line.wasted
        for (const row of loads) {
          const usedHere = Math.min(consumed, row.quantity)
          consumed -= usedHere
          const damagedHere = Math.min(damaged, row.quantity - usedHere)
          damaged -= damagedHere
          const wastedHere = Math.min(wasted, row.quantity - usedHere - damagedHere)
          wasted -= wastedHere
          const left = row.quantity - usedHere - damagedHere - wastedHere
          const expired = !!row.stock_batch.expires_at && row.stock_batch.expires_at <= now
          const discardLeft = product.category === 'meal' || row.stock_batch.is_damaged || expired ? left : 0
          const quantity = usedHere + damagedHere + wastedHere + discardLeft
          if (!quantity) continue
          const changed = await tx.aircraft_stock.updateMany({
            where: { aircraft_id: row.stock_transfer.aircraft_id, stock_batch_id: row.stock_batch_id, quantity: { gte: quantity } },
            data: { quantity: { decrement: quantity } },
          })
          if (changed.count !== 1) {
            throw new ApiErrorException(
              'REPORT_MISMATCH',
              `Aircraft stock for ${product.name} changed. Check the loaded stock and try again.`,
              409,
            )
          }
          const base: Omit<Prisma.stock_movementUncheckedCreateInput, 'type' | 'quantity' | 'reason'> = {
            flight_id: flightId,
            product_id: product.id,
            aircraft_id: row.stock_transfer.aircraft_id,
            stock_batch_id: row.stock_batch_id,
            stock_transfer_id: row.stock_transfer_id,
            created_by_staff_id: staffId,
            occurred_at: now,
          }
          for (const [amount, reason] of [
            [damagedHere, 'damage'],
            [wastedHere, null],
            [discardLeft, row.stock_batch.is_damaged ? 'damage' : expired ? 'expired' : null],
          ] as const) {
            if (amount) await tx.stock_movement.create({ data: { ...base, type: 'discard', quantity: -amount, reason } })
          }
        }
      }
      await tx.catering_order.update({ where: { id: order.id }, data: { status: 'closed', closed_at: now } })
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
    })
    return (await this.getByFlight(flightId))!
  }
}

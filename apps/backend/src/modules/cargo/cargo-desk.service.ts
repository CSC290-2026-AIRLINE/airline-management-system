import { Injectable } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'

const CLOSED_STATUSES = ['expired', 'cancelled', 'rejected']

interface BookingRow {
  id: string
  booking_ref: string
  awb_number: string | null
  shipper_name: string
  consignee_name: string
  flight_number: string
  flight_service_date: Date
  commodity_type_name: string
  pieces: number
  quoted_chargeable_kg: string
  quoted_charge: string
  currency: string
  current_status: string | null
  booked_at: Date
}

interface StatusCount {
  status: string | null
  count: bigint
}

@Injectable()
export class CargoDeskService {
  constructor(private readonly db: DbService) {}

  async listBookings(opts: { status?: string; q?: string; page: number; pageSize: number }) {
    const { status, q, page, pageSize } = opts
    const offset = (page - 1) * pageSize
    const search = q ? `%${q}%` : null

    const rows = await this.db.$queryRaw<BookingRow[]>`
      WITH statused AS (
        SELECT cb.*,
          (SELECT cse.status_after FROM cargo_shipment_event cse
           WHERE cse.cargo_booking_id = cb.id ORDER BY cse.seq DESC LIMIT 1) AS current_status
        FROM cargo_booking cb
      )
      SELECT
        s.id, s.booking_ref, s.awb_number, s.shipper_name, s.consignee_name,
        f.flight_number, f.service_date AS flight_service_date,
        cct.name AS commodity_type_name,
        s.pieces,
        s.quoted_chargeable_kg::text AS quoted_chargeable_kg,
        s.quoted_charge::text AS quoted_charge,
        s.currency, s.current_status, s.booked_at
      FROM statused s
      JOIN cargo_commodity_type cct ON cct.id = s.commodity_type_id
      JOIN flight f ON f.id = s.flight_id
      WHERE (${status ?? null}::text IS NULL
             OR s.current_status = ${status ?? null}::text
             OR (${status ?? null}::text = 'closed' AND s.current_status IN ('expired', 'cancelled', 'rejected')))
        AND (${search}::text IS NULL
             OR s.booking_ref ILIKE ${search}::text
             OR s.awb_number ILIKE ${search}::text
             OR s.shipper_name ILIKE ${search}::text
             OR s.consignee_name ILIKE ${search}::text)
      ORDER BY s.booked_at DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `

    const totalRows = await this.db.$queryRaw<{ total: bigint }[]>`
      WITH statused AS (
        SELECT cb.id, cb.booking_ref, cb.awb_number, cb.shipper_name, cb.consignee_name,
          (SELECT cse.status_after FROM cargo_shipment_event cse
           WHERE cse.cargo_booking_id = cb.id ORDER BY cse.seq DESC LIMIT 1) AS current_status
        FROM cargo_booking cb
      )
      SELECT COUNT(*)::bigint AS total
      FROM statused s
      WHERE (${status ?? null}::text IS NULL
             OR s.current_status = ${status ?? null}::text
             OR (${status ?? null}::text = 'closed' AND s.current_status IN ('expired', 'cancelled', 'rejected')))
        AND (${search}::text IS NULL
             OR s.booking_ref ILIKE ${search}::text
             OR s.awb_number ILIKE ${search}::text
             OR s.shipper_name ILIKE ${search}::text
             OR s.consignee_name ILIKE ${search}::text)
    `

    const total = Number(totalRows[0]?.total ?? 0)

    const counts = await this.statusCounts()

    return {
      data: rows.map((r) => ({
        id: r.id,
        bookingRef: r.booking_ref,
        awbNumber: r.awb_number,
        shipperName: r.shipper_name,
        consigneeName: r.consignee_name,
        flightNumber: r.flight_number,
        flightServiceDate: r.flight_service_date,
        commodityTypeName: r.commodity_type_name,
        pieces: r.pieces,
        quotedChargeableKg: Number(r.quoted_chargeable_kg),
        quotedCharge: Number(r.quoted_charge),
        currency: r.currency,
        status: r.current_status ?? 'unknown',
        bookedAt: r.booked_at,
      })),
      counts,
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    }
  }

  private async statusCounts(): Promise<Record<string, number>> {
    const rows = await this.db.$queryRaw<StatusCount[]>`
      SELECT sub.status, COUNT(*)::bigint AS count
      FROM (
        SELECT (SELECT cse.status_after FROM cargo_shipment_event cse
                WHERE cse.cargo_booking_id = cb.id ORDER BY cse.seq DESC LIMIT 1) AS status
        FROM cargo_booking cb
      ) sub
      GROUP BY sub.status
    `

    const map: Record<string, number> = {
      all: 0,
      held: 0,
      booked: 0,
      accepted: 0,
      loaded: 0,
      in_transit: 0,
      arrived: 0,
      delivered: 0,
      rebook_required: 0,
      closed: 0,
    }

    for (const row of rows) {
      const s = row.status ?? 'unknown'
      const n = Number(row.count)
      map.all += n
      if (CLOSED_STATUSES.includes(s)) {
        map.closed += n
      } else if (s in map) {
        map[s] = n
      }
    }

    return map
  }
}

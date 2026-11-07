import type { BiKpis, BiMetricSums } from './dto/bi-dashboards.types'

/**
 * Rates are computed from sums, never averaged across days or routes (the F14 migration's rule). A rate with no
 * denominator is null, never NaN or zero.
 */
export function computeKpis(sums: BiMetricSums): BiKpis {
  const { departed_count, on_time_count, seat_available, seat_sold, revenue_amount, refund_amount } = sums
  return {
    ...sums,
    on_time_pct: departed_count > 0 ? on_time_count / departed_count : null,
    load_factor: seat_available > 0 ? seat_sold / seat_available : null,
    revenue_per_seat: seat_available > 0 ? (revenue_amount - refund_amount) / seat_available : null,
  }
}

/** Adds up sums from several rows (days or routes). */
export function sumMetrics(rows: BiMetricSums[]): BiMetricSums {
  return rows.reduce<BiMetricSums>(
    (total, row) => ({
      flight_count: total.flight_count + row.flight_count,
      cancelled_count: total.cancelled_count + row.cancelled_count,
      departed_count: total.departed_count + row.departed_count,
      on_time_count: total.on_time_count + row.on_time_count,
      delay_minutes: total.delay_minutes + row.delay_minutes,
      seat_available: total.seat_available + row.seat_available,
      seat_sold: total.seat_sold + row.seat_sold,
      revenue_amount: total.revenue_amount + row.revenue_amount,
      refund_amount: total.refund_amount + row.refund_amount,
    }),
    emptySums(),
  )
}

export function emptySums(): BiMetricSums {
  return {
    flight_count: 0,
    cancelled_count: 0,
    departed_count: 0,
    on_time_count: 0,
    delay_minutes: 0,
    seat_available: 0,
    seat_sold: 0,
    revenue_amount: 0,
    refund_amount: 0,
  }
}

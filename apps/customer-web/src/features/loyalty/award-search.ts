// URL search params of /loyalty/flights, so a search can be reloaded or shared.
export interface AwardSearchParams {
  from?: string // IATA code
  to?: string
  date?: string // yyyy-mm-dd
  back?: string // return date, yyyy-mm-dd; none = one way
  adults?: number
  children?: number
}

const IATA = /^[A-Z]{3}$/
const DAY = /^\d{4}-\d{2}-\d{2}$/

const code = (v: unknown) => (typeof v === 'string' && IATA.test(v.toUpperCase()) ? v.toUpperCase() : undefined)
const day = (v: unknown) => (typeof v === 'string' && DAY.test(v) ? v : undefined)
const count = (v: unknown, min: number) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isInteger(n) && n >= min && n <= 9 ? n : undefined
}

export function parseAwardSearch(search: Record<string, unknown>): AwardSearchParams {
  return {
    from: code(search.from),
    to: code(search.to),
    date: day(search.date),
    back: day(search.back),
    adults: count(search.adults, 1),
    children: count(search.children, 0),
  }
}

/** Passengers who take a seat. Up to 9 together; lap infants take no award seat. */
export const seatsFor = (p: AwardSearchParams) => Math.min(9, (p.adults ?? 1) + (p.children ?? 0))

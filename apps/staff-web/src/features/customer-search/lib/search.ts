/**
 * Pagination for the Customer Search lists.
 *
 * Filtering, sorting and slicing now happen in `GET /api/passengers` — this
 * module only reshapes the server's answer into the `Page` the pagination bar
 * renders, so the bar is unchanged from the design.
 */

export const PAGE_SIZE_OPTIONS = [6, 8, 12, 20] as const

export interface Page<T> {
  items: T[]
  page: number
  pageSize: number
  pageCount: number
  /** 1-based index of the first row on this page, or 0 when there are no rows. */
  from: number
  /** 1-based index of the last row on this page, or 0 when there are no rows. */
  to: number
  total: number
}

/**
 * Builds the page descriptor from a server response. `page` is clamped into
 * range so a stale URL param (`?page=99`) still reports a real page number
 * rather than an empty table on page 99 of 3.
 */
export function toPage<T>(items: T[], total: number, page: number, pageSize: number): Page<T> {
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const clamped = Math.min(Math.max(1, page), pageCount)
  const from = total === 0 ? 0 : (clamped - 1) * pageSize + 1
  const to = total === 0 ? 0 : Math.min(from + items.length - 1, total)

  return { items, page: clamped, pageSize, pageCount, from, to, total }
}

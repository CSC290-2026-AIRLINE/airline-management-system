/**
 * The base and date window the wizard pages hand to each other in the URL, so
 * "Commit" on Build pairings opens Assign crew on the same window.
 */
export interface WindowSearch {
  dateFrom?: string
  dateTo?: string
  base?: string
  /** Opens Fix & publish on this exact run, for a published roster reopened from the history page. */
  runId?: string
  /** With `runId`: land in the fix workspace instead of on the roster. */
  fix?: boolean
}

const DATE = /^\d{4}-\d{2}-\d{2}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Keeps only well-formed values; anything else is dropped and the page falls back to its default. */
export function parseWindowSearch(search: Record<string, unknown>): WindowSearch {
  const out: WindowSearch = {}
  if (typeof search.dateFrom === 'string' && DATE.test(search.dateFrom)) out.dateFrom = search.dateFrom
  if (typeof search.dateTo === 'string' && DATE.test(search.dateTo)) out.dateTo = search.dateTo
  if (typeof search.base === 'string' && /^[A-Za-z]{3}$/.test(search.base)) out.base = search.base.toUpperCase()
  if (typeof search.runId === 'string' && UUID.test(search.runId)) out.runId = search.runId.toLowerCase()
  if (search.fix === true || search.fix === 'true' || search.fix === 1 || search.fix === '1') out.fix = true
  return out
}

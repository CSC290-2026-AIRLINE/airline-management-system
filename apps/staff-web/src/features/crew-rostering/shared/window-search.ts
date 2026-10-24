/**
 * The base and date window the wizard pages hand to each other in the URL, so
 * "Commit" on Build pairings opens Assign crew on the same window.
 */
export interface WindowSearch {
  dateFrom?: string
  dateTo?: string
  base?: string
}

const DATE = /^\d{4}-\d{2}-\d{2}$/

/** Keeps only well-formed values; anything else is dropped and the page falls back to its default. */
export function parseWindowSearch(search: Record<string, unknown>): WindowSearch {
  const out: WindowSearch = {}
  if (typeof search.dateFrom === 'string' && DATE.test(search.dateFrom)) out.dateFrom = search.dateFrom
  if (typeof search.dateTo === 'string' && DATE.test(search.dateTo)) out.dateTo = search.dateTo
  if (typeof search.base === 'string' && /^[A-Za-z]{3}$/.test(search.base)) out.base = search.base.toUpperCase()
  return out
}

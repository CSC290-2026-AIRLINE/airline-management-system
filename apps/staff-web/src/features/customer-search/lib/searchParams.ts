import type { PersonFilter } from '../types'
import { PAGE_SIZE_OPTIONS } from './search'

/**
 * URL state for the Customer Search screens.
 *
 * Search terms, the type tab, the page and the selected person all live in the
 * query string so a filtered view can be shared or reloaded (and so the browser
 * back button behaves the way staff expect after opening a profile).
 *
 * A value equal to its default is held as `undefined` rather than written out.
 * TanStack Router's serializer drops `undefined` but keeps `null` and `''`, so
 * this is what keeps the untouched screen at a bare `/customer-search` instead of
 * `?q=&type=all&page=1&person=null&correct=null` — the `null` in particular was
 * being read back as the string "null". {@link resolveCustomerSearch} puts the
 * defaults back so the page never has to deal with an absent value.
 */
export interface CustomerSearchParams {
  q?: string
  type?: PersonFilter
  page?: number
  /** Absent means "use the breakpoint default" (8 on desktop, 6 on mobile). */
  size?: number
  /** Person id of the open profile; absent when the list is full width. */
  person?: string
  /** Person id whose "Correct identity" dialog is open; absent when none is. */
  correct?: string
}

/** {@link CustomerSearchParams} with the defaults applied. This is what the page reads. */
export interface ResolvedCustomerSearch {
  q: string
  type: PersonFilter
  page: number
  size?: number
  person: string | null
  correct: string | null
}

export const DEFAULT_PAGE_SIZE = 8
export const MOBILE_PAGE_SIZE = 6

export function defaultCustomerSearch(): ResolvedCustomerSearch {
  return resolveCustomerSearch({})
}

function asFilter(value: unknown): PersonFilter {
  // `accountHolder` was the value before the URL moved to kebab-case. A link shared
  // before that change still arrives here, and falling through to 'all' would quietly
  // show a wider result set than the one that was shared.
  if (value === 'accountHolder') {
    return 'account-holder'
  }
  return value === 'account-holder' || value === 'traveller' || value === 'all' ? value : 'all'
}

function asSize(value: unknown): number | undefined {
  const numeric = Number(value)
  return PAGE_SIZE_OPTIONS.includes(numeric as (typeof PAGE_SIZE_OPTIONS)[number]) ? numeric : undefined
}

/**
 * An absent search param. TanStack Router drops an omitted key, but a `null` that
 * survived serialisation in an older link comes back as the *string* `"null"`,
 * which is truthy — treating that as a person id would make the app request
 * `/api/passengers/null` and get a 400.
 */
function asId(value: unknown): string | null {
  return typeof value === 'string' && value !== '' && value !== 'null' && value !== 'undefined' ? value : null
}

/** TanStack Router `validateSearch` — sparse, so defaults never reach the address bar. */
export function parseCustomerSearch(search: Record<string, unknown>): CustomerSearchParams {
  const page = Number(search.page)
  const q = typeof search.q === 'string' ? search.q.trim() : ''
  const type = asFilter(search.type)
  const person = asId(search.person)
  const correct = asId(search.correct)

  return {
    q: q === '' ? undefined : q,
    type: type === 'all' ? undefined : type,
    page: Number.isInteger(page) && page > 1 ? page : undefined,
    size: asSize(search.size),
    person: person ?? undefined,
    correct: correct ?? undefined,
  }
}

/** Fills the defaults back in, so the page always reads a complete state. */
export function resolveCustomerSearch(params: CustomerSearchParams): ResolvedCustomerSearch {
  return {
    q: params.q ?? '',
    type: params.type ?? 'all',
    page: params.page ?? 1,
    size: params.size,
    person: params.person ?? null,
    correct: params.correct ?? null,
  }
}

/**
 * Normalises a resolved state back into URL params for `navigate({ search })`.
 *
 * It reuses {@link parseCustomerSearch} so there is a single round-trip rule: whatever
 * the parser would accept from a URL is exactly what gets written, so returning to a
 * default genuinely clears the address bar instead of leaving a stale value behind.
 */
export function toCustomerSearchParams(resolved: ResolvedCustomerSearch): CustomerSearchParams {
  return parseCustomerSearch({ ...resolved })
}

/**
 * Applies a patch to the current params, returning to page 1 whenever the result
 * set itself changes (a new query or a different type tab).
 */
export function withCustomerSearch(current: ResolvedCustomerSearch, patch: Partial<ResolvedCustomerSearch>): ResolvedCustomerSearch {
  const next: ResolvedCustomerSearch = { ...current, ...patch }
  const resultSetChanged = patch.q !== undefined || patch.type !== undefined
  if (resultSetChanged) {
    next.page = patch.page ?? 1
    next.person = patch.person ?? null
  }
  if (patch.size !== undefined) {
    next.size = patch.size
  }
  return next
}

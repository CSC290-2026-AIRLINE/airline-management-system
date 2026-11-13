import type { Person, PersonFilter, PersonKind } from '../types'
import type { ProfileScope } from './api.ts'
import { PAGE_SIZE_OPTIONS } from './search.ts'

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
  /**
   * The kind of the open profile — `account-holder` or `traveller`.
   *
   * The type tab says what the *list* shows, not what the open person *is*: opening a
   * saved traveller leaves the Account holders tab selected, and the account-holder
   * detail route answers a traveller with a 404. The kind therefore travels with the
   * profile and decides which detail route it is read from — see {@link profileScopeFor}.
   */
  personType?: PersonKind
  /**
   * The id of the profile the open one was opened from, so `← Back` returns to it.
   * Absent when the profile was opened from the result list.
   */
  from?: string
  /** The kind of that profile, restored when `← Back` returns to it. */
  fromType?: PersonKind
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
  personType: PersonKind | null
  from: string | null
  fromType: PersonKind | null
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
 * `/api/staff/passengers/null` and get a 400.
 */
function asId(value: unknown): string | null {
  return typeof value === 'string' && value !== '' && value !== 'null' && value !== 'undefined' ? value : null
}

function asPersonKind(value: unknown): PersonKind | undefined {
  return value === 'account-holder' || value === 'traveller' ? value : undefined
}

/**
 * The API spells a person's kind in camelCase (`accountHolder`); the URL spells it in
 * kebab-case (`account-holder`), like the `type` filter.
 */
export function toPersonKind(type: Person['type']): PersonKind {
  return type === 'accountHolder' ? 'account-holder' : 'traveller'
}

/**
 * Which of the Artifact's two detail routes the open profile is read from.
 *
 * The account-holder route answers an account holder and 404s a traveller, so the route
 * follows the *person*, not the tab: the Account holders tab says what the list shows,
 * but a saved traveller opened from that tab is a traveller and has to be read from the
 * passenger route, which answers for both kinds.
 *
 * A profile whose kind the URL does not carry — a link shared before the kind was
 * recorded — is read from the passenger route too, so it resolves instead of 404ing.
 */
export function profileScopeFor(personType: PersonKind | null): ProfileScope {
  return personType === 'account-holder' ? 'accountHolder' : 'passenger'
}

/** TanStack Router `validateSearch` — sparse, so defaults never reach the address bar. */
export function parseCustomerSearch(search: Record<string, unknown>): CustomerSearchParams {
  const page = Number(search.page)
  const q = typeof search.q === 'string' ? search.q.trim() : ''
  const type = asFilter(search.type)
  const person = asId(search.person)
  // The kind and the profile the open one came from only mean something while a
  // profile is open, so they are dropped together with it.
  const personType = person ? asPersonKind(search.personType) : undefined
  const from = person ? asId(search.from) : null
  const fromType = person ? asPersonKind(search.fromType) : undefined
  const correct = asId(search.correct)

  return {
    q: q === '' ? undefined : q,
    type: type === 'all' ? undefined : type,
    page: Number.isInteger(page) && page > 1 ? page : undefined,
    size: asSize(search.size),
    person: person ?? undefined,
    personType,
    from: from ?? undefined,
    fromType,
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
    personType: params.personType ?? null,
    from: params.from ?? null,
    fromType: params.fromType ?? null,
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
 *
 * The open profile's kind and the profile it was opened from travel with it: naming a
 * person sets them, and closing the profile clears them.
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
  if (next.person === null) {
    // A closed profile takes its kind and the profile it was opened from with it.
    next.personType = null
    next.from = null
    next.fromType = null
  } else if (patch.person !== undefined) {
    // A newly opened profile carries its own kind. Without one it is read from the
    // passenger route, which answers for a holder as well as a traveller.
    next.personType = patch.personType ?? null
    next.from = patch.from ?? null
    next.fromType = next.from === null ? null : (patch.fromType ?? null)
  }
  return next
}

/**
 * Opens a person, recording the profile it was opened from.
 *
 * `parent` is the profile the person was opened from — a saved traveller or a linked
 * account — and is null when the person was opened from the result list. The person's
 * own kind travels with it, because the detail route follows the person and not the
 * type tab: opening a saved traveller from the Account holders tab leaves that tab
 * selected, and the account-holder route answers a traveller with a 404.
 */
export function openPerson(
  current: ResolvedCustomerSearch,
  person: Person,
  parent: { id: string; type: PersonKind } | null,
): ResolvedCustomerSearch {
  return withCustomerSearch(current, {
    person: person.id,
    personType: toPersonKind(person.type),
    from: parent?.id ?? null,
    fromType: parent?.type ?? null,
  })
}

/**
 * Returns to the profile the open one was opened from, and closes the profile when
 * there is none — which is the case when it was opened from the result list.
 */
export function backToParent(current: ResolvedCustomerSearch): ResolvedCustomerSearch {
  if (!current.from) {
    return withCustomerSearch(current, { person: null })
  }
  return withCustomerSearch(current, {
    person: current.from,
    personType: current.fromType,
    from: null,
    fromType: null,
  })
}

import { useEffect, useMemo, useRef } from 'react'
import { useAppAuth } from '@staff-web/auth/AuthProvider'
import type { Gender, PersonFilter } from '../types'

/**
 * The Customer Search client.
 *
 * Every call goes through `AuthProvider.fetchWithAuth`, which attaches the
 * Bearer access token and transparently refreshes it once on a 401 — this
 * feature never reads a token or builds a URL itself.
 *
 * TanStack Query is deliberately not used: it is not installed in this app and
 * `apps/staff-web/CLAUDE.md` forbids introducing a second global fetch/cache
 * layer before Dev Leads add the shared setup. State lives in the page and every
 * request is abortable.
 *
 * The response types below are the wire shapes from
 * `apps/backend/src/modules/passenger-profiles`; `lib/person.ts` maps them to
 * this feature's `Person`.
 */

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/** A row from `GET /api/staff/passengers` or `GET /api/staff/customers`. Dates arrive as ISO strings over JSON. */
export interface PassengerSummaryResponse {
  id: string
  type: 'accountHolder' | 'traveller'
  firstName: string
  lastName: string
  localFirstName: string | null
  localLastName: string | null
  /** ISO timestamp; the column is a `DATE`, so it is midnight UTC. */
  dateOfBirth: string | null
  gender: 'F' | 'M' | 'X' | null
  nationality: string | null
  passportNumber: string | null
  memberSince: string | null
  email: string | null
  phone: string | null
}

export interface PassengerLinkResponse {
  relationship: string | null
  lastBookedAt: string | null
  person: PassengerSummaryResponse
}

/** The response of `GET /api/staff/passengers/:id` and `GET /api/staff/customers/:id`. */
export interface PassengerProfileResponse extends PassengerSummaryResponse {
  profilePhotoUrl: string | null
  savedTravellers: PassengerLinkResponse[]
  linkedAccounts: PassengerLinkResponse[]
}

export interface SearchPassengersResponse {
  items: PassengerSummaryResponse[]
  total: number
  page: number
  size: number
}

/**
 * The `PUT` body. Only the three identity-lock columns are correctable — the Artifact
 * scopes a correction to date of birth, gender and nationality — so names, local
 * spellings and the passport are not sent.
 */
export interface CorrectIdentityBody {
  dateOfBirth: string | null
  gender: Gender | null
  nationality: string | null
  reason: string
  confirm: true
}

export interface SearchPeopleParams {
  q: string
  type: PersonFilter
  page: number
  size: number
}

/** Nest's error body: `{ statusCode, message, error }`, where `message` may be an array. */
interface ErrorBody {
  message?: string | string[]
}

async function toApiError(res: Response): Promise<ApiError> {
  if (res.status === 401) {
    // `fetchWithAuth` already retried once with a fresh token, so this is terminal.
    return new ApiError(401, 'Your session has expired. Sign out and sign in again.')
  }

  let message = `Request failed (${res.status}).`
  try {
    const body = (await res.json()) as ErrorBody
    const raw = Array.isArray(body?.message) ? body.message[0] : body?.message
    if (typeof raw === 'string' && raw.trim() !== '') {
      message = raw
    }
  } catch {
    // A non-JSON error body (a proxy or gateway page) leaves the default message.
  }
  return new ApiError(res.status, message)
}

/**
 * Awaits `fetchWithAuth` and unwraps the body. A rejected promise (network
 * failure, or an aborted request) propagates as-is for the caller to ignore.
 */
async function readJson<T>(pending: Promise<Response>): Promise<T> {
  const res = await pending
  if (!res.ok) {
    throw await toApiError(res)
  }
  return (await res.json()) as T
}

/**
 * The backend's spelling of the filter, which is camelCase where the URL is
 * kebab-case (`type=account-holder` here, `type=accountHolder` to the API).
 * The API rejects anything else, so this mapping is what keeps the shareable URL
 * from leaking into the request.
 */
const API_TYPE: Record<PersonFilter, PassengerSummaryResponse['type'] | 'all'> = {
  all: 'all',
  'account-holder': 'accountHolder',
  traveller: 'traveller',
}

/**
 * Which of the Artifact's two detail routes to read.
 *
 * The Account holders tab is served by `/api/staff/customers`, so a profile opened from it is
 * read from `/api/staff/customers/:id`. Everything else — the All and Travellers tabs, and a
 * deep link straight to `?person=…` where the tab is not known to match — reads the passenger
 * route, which answers for a holder as well as a traveller. That fallback is why a cold link to
 * an account holder still resolves instead of 404ing.
 */
export type ProfileScope = 'accountHolder' | 'passenger'

function buildQuery(params: SearchPeopleParams): string {
  const query = new URLSearchParams()
  query.set('q', params.q)
  query.set('page', String(params.page))
  query.set('size', String(params.size))
  // `GET /api/staff/customers` only ever answers with account holders, so it takes no `type` —
  // sending one is not possible, and a `type` there would be ignored rather than rejected.
  if (params.type !== 'account-holder') {
    query.set('type', API_TYPE[params.type])
  }
  return query.toString()
}

/** The list route for the current tab. The Account holders tab has a route of its own. */
function listUrl(params: SearchPeopleParams): string {
  const base = params.type === 'account-holder' ? '/api/staff/customers' : '/api/staff/passengers'
  return `${base}?${buildQuery(params)}`
}

export interface CustomerSearchApi {
  searchPeople: (params: SearchPeopleParams, signal?: AbortSignal) => Promise<SearchPassengersResponse>
  fetchPerson: (id: string, scope: ProfileScope, signal?: AbortSignal) => Promise<PassengerProfileResponse>
  correctIdentity: (id: string, body: CorrectIdentityBody) => Promise<PassengerSummaryResponse>
}

/**
 * Returns the three Customer Search calls. The returned object has a stable
 * identity across renders so it can be used directly in effect dependency lists.
 */
export function useCustomerSearchApi(): CustomerSearchApi {
  const { fetchWithAuth } = useAppAuth()

  // `AppAuthProvider` publishes a fresh context object — and a fresh
  // `fetchWithAuth` — on every one of its own renders, which happens on each
  // token refresh. Holding it in a ref means the methods below always call the
  // newest one while their own identity stays stable, so a token refresh
  // re-renders this page without restarting its in-flight fetches.
  //
  // The ref is written in an effect rather than during render. This hook's
  // effect is registered before the calling page's fetch effects, so the value
  // is already up to date by the time they run.
  const latest = useRef(fetchWithAuth)
  useEffect(() => {
    latest.current = fetchWithAuth
  }, [fetchWithAuth])

  return useMemo<CustomerSearchApi>(
    () => ({
      searchPeople(params, signal) {
        return readJson<SearchPassengersResponse>(latest.current(listUrl(params), { signal }))
      },
      fetchPerson(id, scope, signal) {
        const base = scope === 'accountHolder' ? '/api/staff/customers' : '/api/staff/passengers'
        return readJson<PassengerProfileResponse>(latest.current(`${base}/${id}`, { signal }))
      },
      correctIdentity(id, body) {
        // `PUT`, not `PATCH`: the Feature 7 Artifact writes updates with PUT.
        return readJson<PassengerSummaryResponse>(
          latest.current(`/api/staff/passengers/${id}/identity`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }),
        )
      },
    }),
    [],
  )
}

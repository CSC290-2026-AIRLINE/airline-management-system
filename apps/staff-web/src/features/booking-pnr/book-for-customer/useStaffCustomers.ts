import { useCallback, useEffect, useState } from 'react'
import { useAppAuth } from '@staff-web/auth/AuthProvider'
import { dateKey, type SavedTraveller } from '@customer-web/features/booking-pnr/passengers/saved-travellers'

/** A Feature 7 person summary, the fields Book for Customer uses. */
interface PersonSummary {
  id: string
  customerId: string | null
  firstName: string
  lastName: string
  dateOfBirth: string | null
  gender: string | null
  nationality: string | null
  passportNumber: string | null
  email: string | null
  phone: string | null
}
/** GET /api/staff/customers/:id */
interface AccountHolderProfile extends PersonSummary {
  savedTravellers: Array<{ relationship: string | null; person: PersonSummary }>
}

/** The customer account a booking is made for. */
export interface StaffBookingCustomer {
  /** The account holder's passenger id, which Feature 7's staff routes address the account by. */
  accountId: string
  /** The id POST /api/staff/bookings takes. */
  customerId: string
  name: string
  email: string
  phone: string
}

async function messageOf(response: Response, fallback: string): Promise<string> {
  if (response.status === 403) return 'An active staff account is required to book for a customer.'
  try {
    const body = (await response.json()) as { error?: { message?: string } }
    return body.error?.message ?? fallback
  } catch {
    return fallback
  }
}

function toCustomer(person: PersonSummary): StaffBookingCustomer | null {
  if (!person.customerId) return null
  return {
    accountId: person.id,
    customerId: person.customerId,
    name: `${person.firstName} ${person.lastName}`.trim(),
    email: person.email ?? '',
    phone: person.phone ?? '',
  }
}

function toTraveller(person: PersonSummary, label: string): SavedTraveller {
  return {
    id: person.id,
    givenName: person.firstName,
    familyName: person.lastName,
    dateOfBirth: dateKey(person.dateOfBirth),
    passportNumber: person.passportNumber ?? '',
    gender: person.gender ?? '',
    nationality: (person.nationality ?? '').toUpperCase(),
    label,
  }
}

/** Searches customer accounts through Feature 7 (GET /api/staff/customers). */
export function useCustomerSearch(term: string) {
  const { fetchWithAuth, isLoading } = useAppAuth()
  const q = term.trim()
  const searching = !isLoading && q.length >= 2
  // Results are kept with the term they answer, so a stale answer is never shown for a newer term.
  const [answer, setAnswer] = useState<{ q: string; results: StaffBookingCustomer[]; error: string | null } | null>(null)
  useEffect(() => {
    if (!searching) return
    const controller = new AbortController()
    // Wait for a pause in typing before searching.
    const timer = setTimeout(async () => {
      try {
        const response = await fetchWithAuth(`/api/staff/customers?q=${encodeURIComponent(q)}&page=1&size=20`, {
          signal: controller.signal,
        })
        if (!response.ok) throw new Error(await messageOf(response, 'Customer search is unavailable.'))
        const body = (await response.json()) as { items: PersonSummary[] }
        setAnswer({ q, results: body.items.flatMap((person) => toCustomer(person) ?? []), error: null })
      } catch (cause) {
        if (!controller.signal.aborted)
          setAnswer({ q, results: [], error: cause instanceof Error ? cause.message : 'Customer search is unavailable.' })
      }
    }, 300)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [q, searching, fetchWithAuth])
  const current = searching && answer?.q === q ? answer : null
  return { results: current?.results ?? [], loading: searching && !current, error: current?.error ?? null }
}

interface LoadedCustomer {
  key: string
  customer: StaffBookingCustomer | null
  travellers: SavedTraveller[]
  error: string | null
  missing: boolean
}

/**
 * The chosen customer and the travellers staff may book for them: the account holder and their saved travellers
 * (GET /api/staff/customers/:id). A booking only accepts those, so staff cannot type in someone new here.
 */
export function useStaffCustomer(accountId: string) {
  const { fetchWithAuth, isLoading } = useAppAuth()
  const [attempt, setAttempt] = useState(0)
  const retry = useCallback(() => setAttempt((value) => value + 1), [])
  const key = `${accountId}#${attempt}`
  // Kept with the account and attempt it answers, so switching customers never shows the previous one's travellers.
  const [loaded, setLoaded] = useState<LoadedCustomer | null>(null)

  useEffect(() => {
    if (!accountId || isLoading) return
    const controller = new AbortController()
    const settle = (result: Omit<LoadedCustomer, 'key'>) => {
      if (!controller.signal.aborted) setLoaded({ key, ...result })
    }
    async function load() {
      try {
        const response = await fetchWithAuth(`/api/staff/customers/${encodeURIComponent(accountId)}`, { signal: controller.signal })
        if (response.status === 404) return settle({ customer: null, travellers: [], error: null, missing: true })
        if (!response.ok) throw new Error(await messageOf(response, 'The customer could not be loaded.'))
        const profile = (await response.json()) as AccountHolderProfile
        const customer = toCustomer(profile)
        if (!customer) return settle({ customer: null, travellers: [], error: null, missing: true })
        settle({
          customer,
          travellers: [
            toTraveller(profile, 'Account holder'),
            ...profile.savedTravellers.map((link) =>
              toTraveller(
                link.person,
                link.relationship ? link.relationship[0].toUpperCase() + link.relationship.slice(1) : 'Saved traveller',
              ),
            ),
          ],
          error: null,
          missing: false,
        })
      } catch (cause) {
        settle({
          customer: null,
          travellers: [],
          error: cause instanceof Error ? cause.message : 'The customer could not be loaded.',
          missing: false,
        })
      }
    }
    void load()
    return () => controller.abort()
  }, [accountId, key, fetchWithAuth, isLoading])

  const current = accountId && loaded?.key === key ? loaded : null
  return {
    customer: current?.customer ?? null,
    travellers: current?.travellers ?? [],
    loading: !!accountId && !current,
    error: current?.error ?? null,
    missing: current?.missing ?? false,
    retry,
  }
}

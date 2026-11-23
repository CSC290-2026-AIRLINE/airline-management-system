import { useCallback, useEffect, useState } from 'react'
import { useAppAuth } from '@customer-web/auth/AuthProvider'
import { readError } from '../api/client'
import type { ResolvePassengers, TravellerDraft } from '../flow/draft'
import { dateKey, sameSavedPerson, type SavedTraveller } from './saved-travellers'

/** GET /api/customers/me, the fields the booking flow uses. */
interface ProfileResponse {
  passengerId: string | null
  needsIdentitySetup: boolean
  firstName: string
  lastName: string
  dateOfBirth: string | null
  gender: string | null
  nationality: string | null
  passportNumber: string | null
  email: string
}
/** One row of GET /api/customers/me/passengers, and the body POST /api/customers/me/passengers returns. */
interface SavedPassengerResponse {
  id: string
  firstName: string
  lastName: string
  dateOfBirth: string | null
  gender: string | null
  nationality: string | null
  passportNumber: string | null
  relationship: string | null
}

const RELATIONSHIP_LABELS: Record<string, string> = {
  spouse: 'Spouse',
  parent: 'Parent',
  child: 'Child',
  sibling: 'Sibling',
  guardian: 'Guardian',
  companion: 'Companion',
  other: 'Saved traveller',
}

function fromSaved(row: SavedPassengerResponse): SavedTraveller {
  return {
    id: row.id,
    givenName: row.firstName,
    familyName: row.lastName,
    dateOfBirth: dateKey(row.dateOfBirth),
    passportNumber: row.passportNumber ?? '',
    gender: row.gender ?? '',
    nationality: (row.nationality ?? '').toUpperCase(),
    label: RELATIONSHIP_LABELS[row.relationship ?? ''] ?? 'Saved traveller',
  }
}

/**
 * Feature 7's passenger adapter for the booking flow. It offers the signed-in customer and their saved travellers, and
 * resolves each traveller of a booking to a passenger id: a picked saved traveller keeps its record, and anyone typed in
 * is saved to the customer's account first (POST /api/customers/me/passengers), so the booking accepts them.
 *
 * A picked traveller whose names and date of birth are unchanged is the same person, so a passport typed in for them is
 * added to their existing record (PUT /api/customers/me or /api/customers/me/passengers/:id) rather than creating a copy.
 */
export function useSavedTravellers(enabled = true) {
  const { fetchWithAuth, isLoading } = useAppAuth()
  const [profiles, setProfiles] = useState<SavedTraveller[]>([])
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<string | null>(null)
  /** The account email, so the booking contact can start with it. */
  const [email, setEmail] = useState('')

  useEffect(() => {
    if (!enabled || isLoading) return
    const controller = new AbortController()
    let active = true
    async function load() {
      try {
        const me = await fetchWithAuth('/api/customers/me', { signal: controller.signal })
        if (!me.ok) throw await readError(me)
        const profile = (await me.json()) as ProfileResponse
        const saved: SavedPassengerResponse[] = []
        let cursor: string | null = null
        do {
          const query: string = cursor ? `?limit=100&cursor=${encodeURIComponent(cursor)}` : '?limit=100'
          const page = await fetchWithAuth(`/api/customers/me/passengers${query}`, { signal: controller.signal })
          if (!page.ok) throw await readError(page)
          const body = (await page.json()) as { items: SavedPassengerResponse[]; nextCursor: string | null }
          saved.push(...body.items)
          cursor = body.nextCursor
        } while (cursor)
        const self: SavedTraveller[] =
          profile.passengerId && !profile.needsIdentitySetup
            ? [
                {
                  id: profile.passengerId,
                  givenName: profile.firstName,
                  familyName: profile.lastName,
                  dateOfBirth: dateKey(profile.dateOfBirth),
                  passportNumber: profile.passportNumber ?? '',
                  gender: profile.gender ?? '',
                  nationality: (profile.nationality ?? '').toUpperCase(),
                  label: 'You',
                  self: true,
                },
              ]
            : []
        if (active) {
          setProfiles([...self, ...saved.map(fromSaved)])
          setEmail(profile.email ?? '')
          setError(null)
        }
      } catch (cause) {
        if (active && !controller.signal.aborted)
          setError(
            cause instanceof Error ? `Your saved travellers could not be loaded: ${cause.message}` : 'Could not load saved travellers.',
          )
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => {
      active = false
      controller.abort()
    }
  }, [enabled, fetchWithAuth, isLoading])

  const save = useCallback(
    async (traveller: TravellerDraft): Promise<SavedTraveller> => {
      if (!traveller.gender || !traveller.nationality.trim())
        throw new Error(`Add the gender and nationality of ${traveller.givenName || 'each new traveller'} to save them to your account.`)
      const response = await fetchWithAuth('/api/customers/me/passengers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: traveller.givenName.trim(),
          lastName: traveller.familyName.trim(),
          dateOfBirth: traveller.dateOfBirth,
          gender: traveller.gender,
          nationality: traveller.nationality.trim(),
          passportNumber: traveller.passportNumber.trim() || null,
        }),
      })
      if (!response.ok) {
        const failure = await readError(response)
        throw new Error(`${traveller.givenName || 'A traveller'} could not be saved to your account: ${failure.message}`)
      }
      const created = fromSaved((await response.json()) as SavedPassengerResponse)
      setProfiles((current) => [...current, created])
      return created
    },
    [fetchWithAuth],
  )

  const addPassport = useCallback(
    async (profile: SavedTraveller, passportNumber: string): Promise<void> => {
      const url = profile.self ? '/api/customers/me' : `/api/customers/me/passengers/${encodeURIComponent(profile.id)}`
      const response = await fetchWithAuth(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passportNumber }),
      })
      if (!response.ok) {
        const failure = await readError(response)
        throw new Error(`The passport number of ${profile.givenName} could not be saved: ${failure.message}`)
      }
      // Feature 7 normalises the number (upper case, no spaces); keep what the traveller typed matched to the record.
      setProfiles((current) => current.map((item) => (item.id === profile.id ? { ...item, passportNumber } : item)))
    },
    [fetchWithAuth],
  )

  const resolve: ResolvePassengers | undefined = enabled
    ? async (travellers: TravellerDraft[]) => {
        const resolved: Array<{ key: string; passengerId: string }> = []
        for (const traveller of travellers) {
          const profile = traveller.savedPassengerId ? profiles.find((candidate) => candidate.id === traveller.savedPassengerId) : undefined
          if (profile && sameSavedPerson(profile, traveller)) {
            const passport = traveller.passportNumber.trim()
            if (passport && passport !== profile.passportNumber) await addPassport(profile, passport)
            resolved.push({ key: traveller.key, passengerId: profile.id })
            continue
          }
          const created = await save(traveller)
          resolved.push({ key: traveller.key, passengerId: created.id })
        }
        return resolved
      }
    : undefined

  return { enabled, profiles, loading, error, email, resolve }
}

import { useEffect, useState } from 'react'
import { useAppAuth } from '@customer-web/auth/AuthProvider'
import type { ResolvePassengers, TravellerDraft } from '../flow/draft'
import { matchesDemoProfile, type DemoPassenger } from './demo-passengers'

/** The details of one traveller, as the development adapter sends them. */
interface PassengerDetails {
  givenName: string
  familyName: string
  dateOfBirth: string
  passportNumber: string
}

/**
 * The temporary development adapter. It replaces Feature 7's passenger resolver, which does not exist yet: the details
 * typed into the passenger form are turned into passenger records by the backend's development-only endpoint, so a hold
 * can be made. Feature 7's adapter replaces this as soon as it lands.
 */
export function useDemoPassengers(enabled = true) {
  const activeMode = import.meta.env.DEV && enabled
  const { fetchWithAuth, isLoading } = useAppAuth()
  const [profiles, setProfiles] = useState<DemoPassenger[]>([])
  const [loading, setLoading] = useState(activeMode)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!activeMode || isLoading) return
    const controller = new AbortController()
    let active = true
    async function load() {
      try {
        const response = await fetchWithAuth('/api/dev/booking-passengers', { signal: controller.signal })
        if (!response.ok) throw new Error('Demo travellers are unavailable. Check that the local demo data has been loaded.')
        const rows = (await response.json()) as DemoPassenger[]
        if (active) {
          setProfiles(rows)
          setError(rows.length ? null : 'No demo travellers are available. Load the Feature 3 demo data first.')
        }
      } catch (cause) {
        if (active && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not load demo travellers.')
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => {
      active = false
      controller.abort()
    }
  }, [activeMode, fetchWithAuth, isLoading])

  /**
   * The passenger records of the travellers. A traveller that still holds the details of a picked demo traveller keeps
   * that traveller's record; every other traveller is typed in, so it gets a record of its own.
   */
  const resolve: ResolvePassengers | undefined = activeMode
    ? async (travellers: TravellerDraft[]) => {
        const resolved: Array<{ key: string; passengerId: string }> = []
        const typed: Array<{ key: string; details: PassengerDetails }> = []
        for (const traveller of travellers) {
          const profile = traveller.demoPassengerId ? profiles.find((candidate) => candidate.id === traveller.demoPassengerId) : undefined
          if (profile && matchesDemoProfile(profile, traveller)) {
            resolved.push({ key: traveller.key, passengerId: profile.id })
            continue
          }
          typed.push({
            key: traveller.key,
            details: {
              givenName: traveller.givenName.trim(),
              familyName: traveller.familyName.trim(),
              dateOfBirth: traveller.dateOfBirth,
              passportNumber: traveller.passportNumber.trim(),
            },
          })
        }
        if (typed.length) {
          const response = await fetchWithAuth('/api/dev/booking-passengers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ passengers: typed.map(({ details }) => details) }),
          })
          if (!response.ok) throw new Error('The traveller details could not be saved. Please try again.')
          const rows = (await response.json()) as Array<{ id?: string }>
          if (!Array.isArray(rows) || rows.length !== typed.length)
            throw new Error('The traveller details could not be saved. Please try again.')
          typed.forEach(({ key }, index) => {
            const id = rows[index]?.id
            if (!id) throw new Error('The traveller details could not be saved. Please try again.')
            resolved.push({ key, passengerId: id })
          })
        }
        return resolved
      }
    : undefined
  return { enabled: activeMode, profiles, loading, error, resolve }
}

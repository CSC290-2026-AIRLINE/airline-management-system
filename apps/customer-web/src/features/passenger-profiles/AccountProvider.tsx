import { useEffect, useEffectEvent, useState, type ReactNode } from 'react'
import { useUser } from '@clerk/clerk-react'
import { Navigate, useLocation } from '@tanstack/react-router'
import { useAppAuth } from '@customer-web/auth/AuthProvider'
import { ProfileContext, type Profile, type Passenger } from './profile-context'
import {
  errorMessage,
  passengerBody,
  passengerView,
  profileRequest,
  profileView,
  type PassengerResponse,
  type ProfileResponse,
} from './profile-api'
import { Button } from '@customer-web/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@customer-web/components/ui/card'
import AccountPage from './components/AccountPage'
import FormError from './components/FormError'

export default function AccountProvider({ children }: { children: ReactNode }) {
  const pathname = useLocation({ select: (location) => location.pathname })
  const auth = useAppAuth()
  const userId = auth.user?.id
  const { user: clerkUser } = useUser()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [passengers, setPassengers] = useState<Passenger[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [retry, setRetry] = useState(0)
  const request = <T,>(path: string, init?: RequestInit) => profileRequest<T>(auth.fetchWithAuth, path, init)

  const load = useEffectEvent(async (signal: AbortSignal) => {
    try {
      // Read persisted data without waiting for an external identity-provider request on every page load.
      const current = await request<ProfileResponse>('/me', { signal })
      const saved: Passenger[] = []
      let cursor: string | null = null
      if (!current.needsIdentitySetup)
        do {
          const page: { items: PassengerResponse[]; nextCursor: string | null } = await request(
            `/me/passengers?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
            { signal },
          )
          saved.push(...page.items.map(passengerView))
          cursor = page.nextCursor
        } while (cursor)
      if (signal.aborted) return
      setProfile(profileView(current))
      setPassengers(saved)
    } catch (failure) {
      if (!signal.aborted) setError(errorMessage(failure))
    } finally {
      if (!signal.aborted) setLoading(false)
    }
  })
  useEffect(() => {
    if (auth.isLoading || !userId) return
    const controller = new AbortController()
    // Updates inside load follow network responses; this Effect Event does not derive state synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(controller.signal)
    return () => controller.abort()
  }, [auth.isLoading, userId, retry])

  async function syncIdentity() {
    const result = await request<ProfileResponse>('/me/sync-identity', { method: 'POST' })
    setProfile(profileView(result))
  }

  if (!auth.isLoading && !auth.user)
    return (
      <AccountPage>
        <Card>
          <CardHeader>
            <CardTitle role="heading" aria-level={1}>
              My Profile
            </CardTitle>
          </CardHeader>
          <CardContent>
            <FormError>Your session could not be started. Please sign out and sign in again.</FormError>
          </CardContent>
        </Card>
      </AccountPage>
    )

  if (loading || error || !profile)
    return (
      <AccountPage>
        <Card aria-busy={loading}>
          <CardHeader>
            <CardTitle role="heading" aria-level={1}>
              My Profile
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            {loading ? (
              <p role="status" className="text-sm text-muted-foreground">
                Loading your profile…
              </p>
            ) : (
              <>
                <FormError>{error}</FormError>
                <Button
                  className="justify-self-start"
                  onClick={() => {
                    setLoading(true)
                    setError('')
                    setRetry((value) => value + 1)
                  }}
                >
                  Try again
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </AccountPage>
    )

  return (
    <ProfileContext.Provider
      value={{
        profile,
        passengers,
        syncIdentity,
        completeIdentitySetup: async (details) => {
          const response = await auth.fetchWithAuth('/api/customers/me/identity', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(details),
          })
          if (!response.ok) {
            const failure: unknown = await response.json().catch(() => null)
            const message = failure && typeof failure === 'object' && 'message' in failure ? failure.message : null
            throw new Error(
              typeof message === 'string'
                ? message
                : Array.isArray(message)
                  ? message.join('. ')
                  : 'Unable to save your details. Please try again.',
            )
          }
          const saved = (await response.json()) as ProfileResponse
          setProfile(profileView(saved))
          setLoading(true)
          setRetry((value) => value + 1)
        },
        updateProfile: async (changes, photoFile) => {
          const body = {
            firstName: changes.firstName,
            lastName: changes.lastName,
            localFirstName: changes.localFirstName === undefined ? undefined : changes.localFirstName || null,
            localLastName: changes.localLastName === undefined ? undefined : changes.localLastName || null,
            passportNumber: changes.passportNumber === undefined ? undefined : changes.passportNumber || null,
            phone: changes.phone || null,
            ...(changes.dateOfBirth ? { dateOfBirth: changes.dateOfBirth } : {}),
            ...(changes.gender ? { gender: changes.gender } : {}),
            ...(changes.nationality ? { nationality: changes.nationality } : {}),
          }
          const result = await request<ProfileResponse>('/me', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
          setProfile(profileView(result))
          if (photoFile !== undefined) {
            if (!clerkUser) throw new Error('Your details were saved. Sign in again to update your photo.')
            try {
              await clerkUser.setProfileImage({ file: photoFile })
              const updated = await request<ProfileResponse>('/me/photo', { method: 'PUT' })
              setProfile(profileView(updated))
            } catch (failure) {
              throw new Error(`Your details were saved, but your photo could not be synchronized. Retry saving. ${errorMessage(failure)}`, {
                cause: failure,
              })
            }
          }
        },
        savePassenger: async (passenger) => {
          const editing = passengers.some((item) => item.id === passenger.id)
          const result = await request<PassengerResponse>(`/me/passengers${editing ? `/${passenger.id}` : ''}`, {
            method: editing ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(passengerBody(passenger, editing)),
          })
          const saved = passengerView(result)
          setPassengers((previous) => (editing ? previous.map((item) => (item.id === saved.id ? saved : item)) : [saved, ...previous]))
        },
        removePassenger: async (id) => {
          await request<void>(`/me/passengers/${id}`, { method: 'DELETE' })
          setPassengers((previous) => previous.filter((item) => item.id !== id))
        },
      }}
    >
      {profile.needsIdentitySetup && pathname !== '/account/first-sign-in' ? (
        <Navigate to="/account/first-sign-in" replace />
      ) : !profile.needsIdentitySetup && pathname === '/account/first-sign-in' ? (
        <Navigate to="/account/my-profile" replace />
      ) : (
        children
      )}
    </ProfileContext.Provider>
  )
}

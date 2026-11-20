/* eslint-disable react-refresh/only-export-components -- this module intentionally pairs a provider with its hook */
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useAuth as useClerkAuth } from '@clerk/clerk-react'

export interface AppUser {
  id: string
  email: string
  type: string
}

interface AppAuthContextValue {
  accessToken: string | null
  user: AppUser | null
  isLoading: boolean
  logout: () => Promise<void>
  fetchWithAuth: (path: string, init?: RequestInit) => Promise<Response>
}

const AppAuthContext = createContext<AppAuthContextValue | null>(null)

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8080'

/** A promise plus the function that resolves it. Used to hold API calls until the first session exchange finishes. */
function createGate() {
  let open!: () => void
  const promise = new Promise<void>((resolve) => {
    open = resolve
  })
  return { promise, open }
}

interface SessionData {
  accessToken: string
  user: AppUser
}

export function AppAuthProvider({ children }: { children: ReactNode }) {
  const { isSignedIn, getToken, signOut } = useClerkAuth()
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [user, setUser] = useState<AppUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  /* Children's effects run before this provider's, so a page that fetches on mount would send its request while
     `accessToken` is still null and get a 401 on a direct page load. `fetchWithAuth` waits on this gate, which opens
     once the first session exchange has settled, then reads the token from the ref rather than the stale render value. */
  const [gate] = useState(createGate)
  const accessTokenRef = useRef<string | null>(null)

  function storeAccessToken(token: string | null) {
    accessTokenRef.current = token
    setAccessToken(token)
  }

  /* One refresh-then-exchange at a time. React StrictMode runs the sync effect twice in dev, and both runs find no refresh
     cookie, so each would POST /api/auth/session and the audit log would record two sign-ins. Sharing the in-flight
     promise makes the second run wait for the first instead of starting its own. */
  const sessionLoadRef = useRef<Promise<SessionData> | null>(null)
  const refreshRef = useRef<Promise<string | null> | null>(null)

  function loadSession(): Promise<SessionData> {
    sessionLoadRef.current ??= (async () => {
      const refreshRes = await fetch(`${API_URL}/api/auth/refresh`, { method: 'POST', credentials: 'include' })
      let data: SessionData
      if (refreshRes.ok) {
        data = (await refreshRes.json()) as { accessToken: string; user: AppUser }
      } else {
        const clerkToken = await getToken()
        if (!clerkToken) {
          throw new Error('No Clerk session token')
        }
        const res = await fetch(`${API_URL}/api/auth/session`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionToken: clerkToken }),
        })
        if (!res.ok) {
          throw new Error('Failed to exchange Clerk session')
        }
        data = (await res.json()) as { accessToken: string; user: AppUser }
      }
      return data
    })().finally(() => {
      sessionLoadRef.current = null
    })
    return sessionLoadRef.current
  }

  useEffect(() => {
    let cancelled = false

    async function sync() {
      if (!isSignedIn) {
        if (!cancelled) {
          storeAccessToken(null)
          setUser(null)
          setIsLoading(false)
          gate.open()
        }
        return
      }

      setIsLoading(true)
      try {
        const data = await loadSession()
        if (!cancelled) {
          storeAccessToken(data.accessToken)
          setUser(data.user)
        }
      } catch (err) {
        console.error(err)
        if (!cancelled) {
          storeAccessToken(null)
          setUser(null)
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
          gate.open()
        }
      }
    }

    void sync()

    return () => {
      cancelled = true
    }
    // loadSession is recreated every render but only closes over getToken, which is already listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn, getToken, gate])

  /*
   * One refresh at a time. Refresh tokens rotate, so a second refresh that sends the old cookie looks like reuse, and the
   * backend then signs the user out everywhere. Parallel 401s (a page of requests that all expire together) must share
   * this one request, not each start their own.
   */
  function refreshAccessToken(): Promise<string | null> {
    if (!refreshRef.current) {
      refreshRef.current = requestRefresh().finally(() => {
        refreshRef.current = null
      })
    }
    return refreshRef.current
  }

  async function requestRefresh(): Promise<string | null> {
    const res = await fetch(`${API_URL}/api/auth/refresh`, { method: 'POST', credentials: 'include' })
    if (!res.ok) {
      storeAccessToken(null)
      return null
    }
    const data = (await res.json()) as { accessToken: string; user: AppUser }
    storeAccessToken(data.accessToken)
    setUser(data.user)
    return data.accessToken
  }

  async function fetchWithAuth(path: string, init: RequestInit = {}): Promise<Response> {
    const doFetch = (token: string | null) =>
      fetch(`${API_URL}${path}`, {
        ...init,
        credentials: 'include',
        headers: { ...init.headers, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      })

    await gate.promise
    let res = await doFetch(accessTokenRef.current)
    if (res.status === 401) {
      const refreshed = await refreshAccessToken()
      if (refreshed) {
        res = await doFetch(refreshed)
      }
    }
    return res
  }

  async function logout(): Promise<void> {
    try {
      await fetch(`${API_URL}/api/auth/logout`, { method: 'POST', credentials: 'include' })
    } finally {
      storeAccessToken(null)
      setUser(null)
      await signOut()
    }
  }

  return <AppAuthContext.Provider value={{ accessToken, user, isLoading, logout, fetchWithAuth }}>{children}</AppAuthContext.Provider>
}

export function useAppAuth(): AppAuthContextValue {
  const ctx = useContext(AppAuthContext)
  if (!ctx) {
    throw new Error('useAppAuth must be used within AppAuthProvider')
  }
  return ctx
}

/* eslint-disable react-refresh/only-export-components -- this module intentionally pairs a provider with its hook */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useAuth as useClerkAuth } from '@clerk/clerk-react'

export interface AppUser {
  id: string
  email: string
  name: string
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

export function AppAuthProvider({ children }: { children: ReactNode }) {
  const { isSignedIn, getToken, signOut } = useClerkAuth()
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [user, setUser] = useState<AppUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function sync() {
      if (!isSignedIn) {
        if (!cancelled) {
          setAccessToken(null)
          setUser(null)
          setIsLoading(false)
        }
        return
      }

      setIsLoading(true)
      try {
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
        const data = (await res.json()) as { accessToken: string; user: AppUser }
        if (!cancelled) {
          setAccessToken(data.accessToken)
          setUser(data.user)
        }
      } catch (err) {
        console.error(err)
        if (!cancelled) {
          setAccessToken(null)
          setUser(null)
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void sync()

    return () => {
      cancelled = true
    }
  }, [isSignedIn, getToken])

  async function refreshAccessToken(): Promise<string | null> {
    const res = await fetch(`${API_URL}/api/auth/refresh`, { method: 'POST', credentials: 'include' })
    if (!res.ok) {
      setAccessToken(null)
      return null
    }
    const data = (await res.json()) as { accessToken: string }
    setAccessToken(data.accessToken)
    return data.accessToken
  }

  async function fetchWithAuth(path: string, init: RequestInit = {}): Promise<Response> {
    const doFetch = (token: string | null) =>
      fetch(`${API_URL}${path}`, {
        ...init,
        credentials: 'include',
        headers: { ...init.headers, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      })

    let res = await doFetch(accessToken)
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
      setAccessToken(null)
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

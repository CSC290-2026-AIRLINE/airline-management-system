import { useEffect, useState } from 'react'
import { useAppAuth } from '@customer-web/auth/AuthProvider'
import type { ResolvePassengers } from '../flow/draft'
import { resolveDemoPassengers, type DemoPassenger } from './demo-passengers'

// Replace this boundary with Feature 7's adapter after its API lands in dev.
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
  const resolve: ResolvePassengers | undefined =
    activeMode && !loading && !error ? (travellers) => Promise.resolve(resolveDemoPassengers(travellers, profiles)) : undefined
  return { enabled: activeMode, profiles, loading, error, resolve }
}

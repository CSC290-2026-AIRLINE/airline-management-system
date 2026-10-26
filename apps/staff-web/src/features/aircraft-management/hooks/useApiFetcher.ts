import { useEffect, useRef } from 'react'
import { useAppAuth } from '@staff-web/auth/AuthProvider'
import type { Fetcher } from '../api/http'

/**
 * `fetchWithAuth` gets a new identity on every render of the shared auth provider, so it cannot be
 * listed as an effect dependency without reloading on every render. The ref always holds the newest
 * function while staying stable for the dependency list.
 */
export function useApiFetcher(): React.RefObject<Fetcher> {
  const { fetchWithAuth } = useAppAuth()
  const fetcherRef = useRef<Fetcher>(fetchWithAuth)

  useEffect(() => {
    fetcherRef.current = fetchWithAuth
  }, [fetchWithAuth])

  return fetcherRef
}

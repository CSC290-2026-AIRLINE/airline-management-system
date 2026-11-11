import type { ScreenGroup } from '../types'
import { useFetchJson } from './fetch'

export interface ScreensResponse {
  groups: ScreenGroup[]
}

export function useListScreens() {
  const fetchJson = useFetchJson()
  return () => fetchJson<ScreensResponse>('/api/admin/screens')
}

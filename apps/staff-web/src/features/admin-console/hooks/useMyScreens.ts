import { useEffect, useState } from 'react'
import { useFetchJson } from '../api/fetch'
import { usePreviewMode } from './usePreviewMode'
import { previewMyScreens } from '../preview-data'
import type { MyScreensResponse } from '../api/me'

export interface UseMyScreensState {
  loading: boolean
  error: string | null
  codes: string[]
  /**
   * Whether the signed-in user has a staff account. `null` until the first fetch resolves — treat it as unknown, not
   * as false, or every page would flash the "not provisioned" screen on every load.
   */
  provisioned: boolean | null
  /** Where the current value came from. `pending` is the brief window before the first fetch resolves. */
  source: 'live' | 'preview' | 'pending'
}

/**
 * Loads the codes of every screen the signed-in user can open. Mirrors the established `useRoleAccess` /
 * `useAuditLog` pattern: preview mode never flips mid-session (the `AdminPreviewBanner` reloads the page to toggle
 * it), so the right `source` and initial value come from a lazy `useState` initializer instead of being set inside
 * the effect body — the `react-hooks/set-state-in-effect` rule rejects that.
 */
export function useMyScreens(): UseMyScreensState {
  const isPreview = usePreviewMode()
  const fetchJson = useFetchJson()

  const [state, setState] = useState<UseMyScreensState>(() =>
    isPreview
      ? { loading: false, error: null, codes: previewMyScreens.screen_codes, provisioned: true, source: 'preview' }
      : { loading: true, error: null, codes: [], provisioned: null, source: 'pending' },
  )

  useEffect(() => {
    if (isPreview) return
    let cancelled = false
    fetchJson<MyScreensResponse>('/api/me/screens')
      .then((d) => {
        if (cancelled) return
        setState({ loading: false, error: null, codes: d.screen_codes, provisioned: d.provisioned, source: 'live' })
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setState({
          loading: false,
          error: e instanceof Error ? e.message : String(e),
          codes: [],
          // Unknown, not false: a failed request is not proof that the account is unprovisioned, and claiming it is
          // would send a real staff member to the "ask an admin" screen because their network blipped.
          provisioned: null,
          source: 'live',
        })
      })
    return () => {
      cancelled = true
    }
    // fetchJson closes over the stable AuthProvider.fetchWithAuth; identity changes don't matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPreview])

  return state
}

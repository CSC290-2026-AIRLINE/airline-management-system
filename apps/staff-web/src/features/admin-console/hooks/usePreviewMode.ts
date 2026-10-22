import { useEffect, useState } from 'react'

/**
 * `true` when the URL has `?preview=1`. Set on mount + on history changes. Used by Role access & Audit log to render
 * sample data when the real backend has nothing yet — see `preview-data.ts`. Production paths never read this flag.
 */
export function usePreviewMode(): boolean {
  const [preview, setPreview] = useState<boolean>(() => readPreview())

  useEffect(() => {
    function onChange() {
      setPreview(readPreview())
    }
    window.addEventListener('popstate', onChange)
    // patchHistory to re-render when the user toggles ?preview=1 via a link click — see AdminPreviewBanner.
    return () => {
      window.removeEventListener('popstate', onChange)
    }
  }, [])

  return preview
}

function readPreview(): boolean {
  return readQueryFlag('preview')
}

/**
 * `true` when the URL has `?denied=1`, which forces the shared access-denied card to render.
 *
 * This exists for the same reason `?preview=1` does: the real 403 path needs an admin session to reach, and during
 * rollout there is not always one to hand. The flag is a design-review aid only — it never changes what the API is
 * allowed to do, and production paths that read it also require `?preview=1`.
 */
export function useDeniedPreview(): boolean {
  return readQueryFlag('denied')
}

/**
 * `true` when the URL has `?unprovisioned=1`, which forces the "no staff account" card to render.
 *
 * The same aid as `?denied=1`, for the same reason: the real path needs an account that does not exist yet, so there
 * is no way to reach that screen honestly during rollout.
 *
 * The one URL that shows it is `/admin/roles?preview=1&unprovisioned=1` — `/admin` redirects there anyway, and the
 * card replaces the whole workspace, so it does not matter which tab the path names. That one path is the only one the
 * flag answers on (`UNPROVISIONED_PREVIEW_PATH` in `routes/_authenticated/admin/route.tsx`); on any other admin path
 * it falls through to the live page.
 */
export function useUnprovisionedPreview(): boolean {
  return readQueryFlag('unprovisioned')
}

/** `true` when the named URL flag is set to `1`. Both flags are read the same way so they stay consistent. */
function readQueryFlag(name: string): boolean {
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).get(name) === '1'
}

/** Toggle `?preview=1` on the current URL without a full reload. */
export function togglePreviewModeInUrl(): void {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  if (url.searchParams.get('preview') === '1') {
    url.searchParams.delete('preview')
  } else {
    url.searchParams.set('preview', '1')
  }
  window.history.pushState({}, '', url.toString())
  window.dispatchEvent(new PopStateEvent('popstate'))
}

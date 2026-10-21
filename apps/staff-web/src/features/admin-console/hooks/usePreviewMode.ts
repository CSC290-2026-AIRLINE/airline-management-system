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
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).get('preview') === '1'
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

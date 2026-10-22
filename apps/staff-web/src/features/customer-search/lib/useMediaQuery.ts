import { useCallback, useSyncExternalStore } from 'react'

/**
 * Subscribes to a CSS media query so the page can pick the desktop or the mobile
 * composition in JS. The same breakpoint is expressed in CSS for layout; this
 * only decides *which* markup is rendered, so both variants never coexist in the
 * DOM (duplicate ids, doubled focusables).
 *
 * `useSyncExternalStore` is the intended API here: `matchMedia` is an external
 * store, and subscribing through it avoids an effect that re-renders after paint.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', onStoreChange)
      return () => list.removeEventListener('change', onStoreChange)
    },
    [query],
  )

  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query])

  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}

/** Matches the `--cs-mobile` breakpoint used throughout `customer-search.css`. */
export const MOBILE_QUERY = '(max-width: 767px)'

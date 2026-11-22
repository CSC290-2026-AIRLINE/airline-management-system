import { useSyncExternalStore } from 'react'

// Phone layout breakpoint; keep in sync with the 800px media query in pricing.css.
export const PHONE_QUERY = '(max-width: 800px)'

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}

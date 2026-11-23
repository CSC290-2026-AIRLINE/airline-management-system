import { useSyncExternalStore } from 'react'

// True while the media query matches, e.g. useMediaQuery(DESKTOP). Used where the phone and desktop layouts differ in
// behaviour (a bottom sheet vs an inline panel), not just in styling, which Tailwind variants handle.
export function useMediaQuery(query: string) {
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

// Tailwind's lg breakpoint, where the staff shell shows its sidebar.
export const DESKTOP = '(min-width: 1024px)'

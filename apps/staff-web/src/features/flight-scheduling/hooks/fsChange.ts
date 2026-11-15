import { useEffect, useRef } from 'react'

// A tiny broadcast so one part of the screen can tell the rest that something it shows has changed: a resolved conflict changes the badge on
// the Conflicts tab, a saved approval mode changes which tabs exist.
export type FsChange = 'conflicts' | 'settings'
const NAME = 'fs-change'

export const emitChange = (kind: FsChange) => window.dispatchEvent(new CustomEvent<FsChange>(NAME, { detail: kind }))

export function useOnChange(kind: FsChange, run: () => void) {
  const latest = useRef(run)
  useEffect(() => {
    latest.current = run
  })
  useEffect(() => {
    const listener = (e: Event) => {
      if ((e as CustomEvent<FsChange>).detail === kind) latest.current()
    }
    window.addEventListener(NAME, listener)
    return () => window.removeEventListener(NAME, listener)
  }, [kind])
}

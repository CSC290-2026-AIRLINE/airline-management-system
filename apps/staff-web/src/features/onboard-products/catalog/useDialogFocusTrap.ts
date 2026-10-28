// Focus trap + Escape handler for a dialog. Saves focus on open, restores it on close.

import { useEffect, type RefObject } from 'react'
import { getOpenMenuFocusables } from './openMenus'

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export function useDialogFocusTrap(open: boolean, containerRef: RefObject<HTMLElement | null>, onEscape: () => void) {
  useEffect(() => {
    if (!open) return
    const container = containerRef.current
    if (!container) return

    const previouslyFocused = document.activeElement as HTMLElement | null

    const focusables = () => [
      ...Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)),
      // The kebab menu is portalled out of the dialog, so its items are not
      // found by the query above but still belong to the Tab cycle.
      ...getOpenMenuFocusables(container, FOCUSABLE),
    ]
    const first = focusables()[0]
    first?.focus()

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onEscape()
        return
      }
      if (e.key !== 'Tab') return
      const items = focusables()
      if (items.length === 0) {
        e.preventDefault()
        return
      }
      const firstEl = items[0]
      const lastEl = items[items.length - 1]
      const active = document.activeElement as HTMLElement | null
      if (e.shiftKey && active === firstEl) {
        e.preventDefault()
        lastEl.focus()
      } else if (!e.shiftKey && active === lastEl) {
        e.preventDefault()
        firstEl.focus()
      }
    }

    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      previouslyFocused?.focus()
    }
  }, [open, containerRef, onEscape])
}

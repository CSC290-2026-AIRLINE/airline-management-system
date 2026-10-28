// Three-dot kebab menu. Renders a button that opens a small dropdown with the
// given actions. Closes on outside click, on Escape, and on selecting an item.
//
// The dropdown is rendered through a React portal into document.body and
// positioned with `position: fixed`. Table cells and scroll containers clip
// absolutely positioned children (`overflow-x: auto` computes `overflow-y` to
// `auto` as well), so a menu that stays inside the table gets cut off by the
// cell it lives in. Portalling out of the table escapes every clipping and
// stacking context, and the menu is re-positioned on scroll so that it keeps
// following its button.

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { registerOpenMenu, unregisterOpenMenu } from './openMenus'
import styles from './KebabMenu.module.css'

export interface KebabAction {
  label: string
  onSelect: () => void
  destructive?: boolean
}

interface Props {
  actions: KebabAction[]
  label?: string
}

const MENU_GAP = 4
const VIEWPORT_MARGIN = 8

export function KebabMenu({ actions, label = 'Actions' }: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLUListElement | null>(null)

  // Place the portalled menu against the button. This runs on layout, so the
  // menu is never painted in the wrong spot, and it re-places the menu on
  // every scroll of any container (capture phase) so the menu follows the
  // button instead of staying behind.
  useLayoutEffect(() => {
    if (!open) return
    const root = rootRef.current
    const menu = menuRef.current
    if (!root || !menu) return
    registerOpenMenu(root, menu)

    function place() {
      const button = buttonRef.current
      const current = menuRef.current
      if (!button || !current) return
      const rect = button.getBoundingClientRect()
      // The button scrolled out of the viewport: the menu would be detached.
      if (rect.bottom < 0 || rect.top > window.innerHeight) {
        setOpen(false)
        return
      }
      const width = current.offsetWidth
      const height = current.offsetHeight
      const roomBelow = window.innerHeight - rect.bottom - MENU_GAP - VIEWPORT_MARGIN
      const roomAbove = rect.top - MENU_GAP - VIEWPORT_MARGIN
      // Prefer below the button, flip above it when there is no room.
      const flip = height > roomBelow && roomAbove > roomBelow
      const top = flip ? rect.top - height - MENU_GAP : rect.bottom + MENU_GAP
      const left = Math.min(
        Math.max(VIEWPORT_MARGIN, rect.right - width),
        Math.max(VIEWPORT_MARGIN, window.innerWidth - width - VIEWPORT_MARGIN),
      )
      current.style.top = `${top}px`
      current.style.left = `${left}px`
    }

    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
      unregisterOpenMenu(root)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node
      // The menu is portalled out of the button, so it is checked separately.
      if (rootRef.current?.contains(target)) return
      if (menuRef.current?.contains(target)) return
      setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    // Move focus into the menu for keyboard users.
    const first = menuRef.current?.querySelector<HTMLButtonElement>('button')
    first?.focus()
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className={styles.button}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
      >
        <span aria-hidden="true">⋮</span>
      </button>
      {open &&
        createPortal(
          <ul ref={menuRef} className={styles.menu} role="menu" aria-label={label}>
            {actions.map((a) => (
              <li key={a.label} role="none">
                <button
                  type="button"
                  role="menuitem"
                  className={`${styles.item} ${a.destructive ? styles.destructive : ''}`}
                  onClick={() => {
                    setOpen(false)
                    a.onSelect()
                  }}
                >
                  {a.label}
                </button>
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </div>
  )
}

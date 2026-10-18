// Three-dot kebab menu. Renders a button that opens a small dropdown with the
// given actions. Closes on outside click, on Escape, and on selecting an item.

import { useEffect, useRef, useState } from 'react'
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

export function KebabMenu({ actions, label = 'Actions' }: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLUListElement | null>(null)

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current) return
      if (!rootRef.current.contains(e.target as Node)) setOpen(false)
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
      {open && (
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
        </ul>
      )}
    </div>
  )
}

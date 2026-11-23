import { useEffect, useRef, useState } from 'react'

export interface FilterSelectOption {
  value: string
  label: string
}

interface FilterSelectProps {
  /** Accessible name of the listbox. */
  label: string
  value: string
  options: FilterSelectOption[]
  onChange: (value: string) => void
}

/**
 * The dropdown the design draws as "Last 30 days  ⌄" — the chevron sits right after the label, so the control is
 * built here instead of with a native `<select>`, which would put its own arrow at the far end of the box.
 */
export function FilterSelect({ label, value, options, onChange }: FilterSelectProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) {
      return
    }
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  const selected = options.find((option) => option.value === value)

  return (
    <div className="ra-filterSelect" ref={containerRef}>
      <button
        type="button"
        className="ra-filterSelectButton"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((isOpen) => !isOpen)}
      >
        <span className="ra-filterSelectLabel">{selected?.label ?? ''}</span>
        <span className="ra-filterChevron" aria-hidden="true">
          ⌄
        </span>
      </button>

      {open && (
        <ul className="ra-filterMenu" role="listbox" aria-label={label}>
          {options.map((option) => (
            <li key={option.value} role="none">
              <button
                type="button"
                role="option"
                aria-selected={option.value === value}
                className={`ra-filterOption${option.value === value ? ' ra-filterOption--selected' : ''}`}
                onClick={() => {
                  onChange(option.value)
                  setOpen(false)
                }}
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

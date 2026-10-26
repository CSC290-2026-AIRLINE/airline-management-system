import { useEffect, useId, useRef, useState } from 'react'

/** Page-only select that always opens above the pagination footer. */
export function PageSelect({
  value,
  count,
  onChange,
  disabled = false,
  label,
}: {
  value: number
  count: number
  onChange: (index: number) => void
  disabled?: boolean
  label: string
}) {
  const id = useId()
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(value)
  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])
  useEffect(() => {
    if (open) root.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [active, open])
  function choose(index: number) {
    if (disabled) return
    onChange(index)
    setOpen(false)
    trigger.current?.focus()
  }
  return (
    <div
      className="sq-page-select"
      ref={root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
      }}
    >
      <button
        ref={trigger}
        type="button"
        className="sq-page-select-trigger"
        disabled={disabled}
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open && !disabled}
        aria-controls={id}
        aria-activedescendant={open && !disabled ? `${id}-${active}` : undefined}
        onClick={() => {
          setActive(value)
          setOpen(!open)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setOpen(false)
            event.preventDefault()
          } else if (event.key === 'Tab') setOpen(false)
          else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            if (!open) {
              setActive(value)
              setOpen(true)
            } else setActive((index) => Math.max(0, Math.min(count - 1, index + (event.key === 'ArrowDown' ? 1 : -1))))
          } else if (event.key === 'Home' || event.key === 'End') {
            event.preventDefault()
            setOpen(true)
            setActive(event.key === 'Home' ? 0 : count - 1)
          } else if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            if (open) choose(active)
            else {
              setActive(value)
              setOpen(true)
            }
          }
        }}
      >
        Page {value + 1}
        <span aria-hidden="true">⌃</span>
      </button>
      {open && !disabled && (
        <div className="sq-page-select-options" role="listbox" aria-label={label} id={id}>
          {Array.from({ length: count }, (_, index) => (
            <div
              key={index}
              id={`${id}-${index}`}
              role="option"
              aria-selected={index === value}
              data-active={index === active}
              onMouseDown={(event) => event.preventDefault()}
              onMouseMove={() => setActive(index)}
              onClick={() => choose(index)}
            >
              Page {index + 1}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

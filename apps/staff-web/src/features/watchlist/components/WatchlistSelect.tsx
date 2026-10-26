import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'

interface SelectOption {
  value: string
  label: string
}

export function WatchlistSelect({
  label,
  value,
  options,
  onChange,
  name,
  field = false,
}: {
  label: string
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
  name?: string
  field?: boolean
}) {
  const id = useId()
  const ref = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  )
  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])

  function choose(index: number) {
    onChange(options[index].value)
    setOpen(false)
  }
  function keyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'Escape' && open) {
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
      return
    }
    if (event.key === 'Tab') {
      setOpen(false)
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setActive(open ? (active + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length : selectedIndex)
      setOpen(true)
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      setActive(event.key === 'Home' ? 0 : options.length - 1)
      setOpen(true)
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (open) choose(active)
      else {
        setActive(selectedIndex)
        setOpen(true)
      }
    }
  }

  return (
    <div
      className={`wl-select ${field ? 'wl-select-field' : 'wl-select-filter'}`}
      ref={ref}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
      }}
    >
      {name && <input type="hidden" name={name} value={value} />}
      <select className="wl-native-select" aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        className={`wl-select-trigger${value === '' ? ' wl-placeholder' : ''}`}
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={`${id}-options`}
        aria-haspopup="listbox"
        aria-activedescendant={open ? `${id}-${active}` : undefined}
        onClick={() => {
          setActive(selectedIndex)
          setOpen(!open)
        }}
        onKeyDown={keyDown}
      >
        <span>{options[selectedIndex].label}</span>
        <span className="wl-select-arrow" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <div className="wl-select-options" role="listbox" id={`${id}-options`} aria-label={label}>
          {options.map((option, index) => (
            <div
              key={option.value}
              id={`${id}-${index}`}
              role="option"
              aria-selected={value === option.value}
              className={`${value === option.value ? 'wl-option-selected' : ''} ${active === index ? 'wl-option-active' : ''} ${option.value === '' ? 'wl-option-placeholder' : ''}`}
              onMouseDown={(event) => event.preventDefault()}
              onMouseMove={() => setActive(index)}
              onClick={() => choose(index)}
            >
              <span className="wl-option-check" aria-hidden="true">
                {value === option.value ? '✓' : ''}
              </span>
              <span>{option.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

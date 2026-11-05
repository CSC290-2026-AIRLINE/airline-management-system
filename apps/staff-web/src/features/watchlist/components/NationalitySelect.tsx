import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { nationalityLabel, nationalityOptions } from '../nationalities'

export function NationalitySelect({ value, onChange }: { value: string; onChange: (code: string) => void }) {
  const id = useId()
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const options = query.trim()
    ? nationalityOptions.filter((option) => option.search.includes(query.trim().toLowerCase()))
    : [{ value: '', label: 'Select nationality', search: '' }, ...nationalityOptions]

  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])
  useEffect(() => {
    if (!open || !list.current) return
    const option = list.current.querySelector(`[data-index="${active}"]`)
    if (!option) return
    const bounds = list.current.getBoundingClientRect()
    const item = option.getBoundingClientRect()
    if (item.top < bounds.top) list.current.scrollTop -= bounds.top - item.top
    else if (item.bottom > bounds.bottom) list.current.scrollTop += item.bottom - bounds.bottom
  }, [active, open])

  function choose(index: number) {
    const option = options[index]
    if (!option) return
    onChange(option.value)
    setOpen(false)
    trigger.current?.focus()
  }
  function openMenu() {
    setQuery('')
    setActive(Math.max(0, nationalityOptions.findIndex((option) => option.value === value) + 1))
    setOpen(true)
  }
  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
      trigger.current?.focus()
    } else if (event.key === 'Tab') setOpen(false)
    else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (options.length) setActive((active + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      choose(active)
    } else if (event.key === 'Home' && event.ctrlKey) {
      event.preventDefault()
      setActive(0)
    } else if (event.key === 'End' && event.ctrlKey) {
      event.preventDefault()
      setActive(Math.max(0, options.length - 1))
    }
  }

  return (
    <div
      className="wl-select wl-select-field wl-select-searchable"
      ref={root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
      }}
    >
      <input type="hidden" name="nationality" value={value} />
      <button
        ref={trigger}
        type="button"
        className={`wl-select-trigger${value ? '' : ' wl-placeholder'}`}
        aria-label="Nationality"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? `${id}-popup` : undefined}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            openMenu()
          }
        }}
      >
        <span>{nationalityLabel(value)}</span>
        <span className="wl-select-arrow" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <div id={`${id}-popup`} className="wl-select-options wl-nationality-popup" role="dialog" aria-label="Choose nationality">
          <input
            type="search"
            role="combobox"
            aria-label="Search nationality"
            placeholder="Search name or code"
            autoFocus
            aria-expanded="true"
            aria-autocomplete="list"
            aria-controls={`${id}-list`}
            aria-activedescendant={options[active] ? `${id}-${active}` : undefined}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setActive(0)
            }}
            onKeyDown={keyDown}
          />
          <div className="wl-nationality-list" ref={list} role="listbox" id={`${id}-list`} aria-label="Nationalities">
            {options.map((option, index) => (
              <div
                id={`${id}-${index}`}
                data-index={index}
                key={option.value}
                role="option"
                aria-selected={value === option.value}
                className={`${value === option.value ? 'wl-option-selected' : ''} ${active === index ? 'wl-option-active' : ''}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(index)}
              >
                <span className="wl-option-check" aria-hidden="true">
                  {value === option.value ? '✓' : ''}
                </span>
                <span>{option.label}</span>
              </div>
            ))}
          </div>
          {!options.length && (
            <p className="wl-nationality-empty" role="status">
              No nationality found.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

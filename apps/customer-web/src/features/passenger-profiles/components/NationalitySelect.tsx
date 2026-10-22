import { useId, useRef, useState } from 'react'
import { nationalityOptions, nationalitySearchText } from '../profile-api'

type Props = {
  value: string
  disabled?: boolean
  onChange: (code: string) => void
}

export default function NationalitySelect({ value, disabled, onChange }: Props) {
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const label = nationalityOptions.find(([code]) => code === value)?.[1] ?? ''
  const search = query.trim().toLowerCase()
  const options = nationalityOptions.filter((option) => nationalitySearchText(option).includes(search))
  function choose(code: string) {
    onChange(code)
    setQuery('')
    setOpen(false)
    input.current?.setCustomValidity('')
  }
  function close() {
    setOpen(false)
    setQuery('')
  }
  function move(index: number) {
    setActive(index)
    document.getElementById(`${id}-${index}`)?.scrollIntoView({ block: 'nearest' })
  }
  return (
    <div
      className="profile-field nationality-select"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) close()
      }}
    >
      <label htmlFor={id}>Nationality</label>
      <input
        ref={input}
        id={id}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-activedescendant={open && options[active] ? `${id}-${active}` : undefined}
        aria-describedby="setup-lock-warning"
        autoComplete="off"
        placeholder="Search nationality"
        required
        disabled={disabled}
        value={open ? query : label || query}
        onClick={() => {
          if (!open) {
            setQuery('')
            setActive(0)
            setOpen(true)
          }
        }}
        onFocus={() => {
          setQuery('')
          setActive(0)
          setOpen(true)
        }}
        onChange={(event) => {
          setQuery(event.target.value)
          setOpen(true)
          setActive(0)
          onChange('')
          event.currentTarget.setCustomValidity(event.target.value ? 'Choose a nationality from the list.' : '')
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            setOpen(true)
            move(Math.max(0, Math.min(options.length - 1, active + (event.key === 'ArrowDown' ? 1 : -1))))
          } else if (event.key === 'Enter' && open) {
            event.preventDefault()
            if (options[active]) choose(options[active][0])
          } else if (event.key === 'Escape') {
            event.preventDefault()
            close()
          }
        }}
      />
      {open && !disabled && (
        <ul id={`${id}-list`} role="listbox" aria-label="Nationalities" className="nationality-options">
          {options.map(([code, name, country], index) => (
            <li
              key={code}
              id={`${id}-${index}`}
              role="option"
              aria-selected={value === code}
              className={active === index ? 'is-active' : ''}
              onPointerDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActive(index)}
              onClick={() => choose(code)}
            >
              <span>{name}</span>
              {country !== name && <span className="nationality-country">{country}</span>}
            </li>
          ))}
          {!options.length && (
            <li role="presentation" className="nationality-empty">
              No match{search ? ` for “${search}”` : ''} — try a country name, e.g. “United Kingdom”
            </li>
          )}
        </ul>
      )}
    </div>
  )
}

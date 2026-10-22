import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CheckIcon, ChevronDownIcon } from './Icons'

/**
 * Custom listbox select. The design shows the "Correct identity" dropdowns in
 * their open state, which a native `<select>` cannot render (the OS popup is
 * outside the page), so the option list is drawn in the DOM instead.
 *
 * The list is portalled to `<body>` and positioned against the trigger's
 * viewport rect. The dialog is a scroll container (`overflow-y: auto`), so an
 * in-flow menu would be clipped by it and by the dialog's own bounds — the
 * design shows the menu floating clear of everything underneath it.
 */

export interface SelectOption<T extends string> {
  value: T
  label: string
}

interface SelectProps<T extends string> {
  value: T
  options: ReadonlyArray<SelectOption<T>>
  onChange: (value: T) => void
  ariaLabel: string
  invalid?: boolean
}

interface MenuPosition {
  left: number
  width: number
  maxHeight: number
  /** Grows downward from here, when the menu opens below the trigger. */
  top: number
  /** Grows upward from here, when the menu opens above the trigger. */
  bottom: number
  above: boolean
}

const MENU_GAP = 4
const MENU_MIN_WIDTH = 208
/** Space kept between the menu edge and the viewport edge. */
const VIEWPORT_MARGIN = 8
/** Below this much room, a full menu would be cramped — flip above instead. */
const MIN_SPACE_BELOW = 160

/** Places the menu below the trigger, or above it when the space below runs out. */
function measureMenu(trigger: HTMLElement): MenuPosition {
  const rect = trigger.getBoundingClientRect()
  const width = Math.max(MENU_MIN_WIDTH, rect.width)
  const spaceBelow = window.innerHeight - rect.bottom - MENU_GAP - VIEWPORT_MARGIN
  const spaceAbove = rect.top - MENU_GAP - VIEWPORT_MARGIN
  const above = spaceBelow < MIN_SPACE_BELOW && spaceAbove > spaceBelow

  return {
    above,
    left: Math.min(rect.left, window.innerWidth - width - VIEWPORT_MARGIN),
    width,
    maxHeight: Math.max(120, above ? spaceAbove : spaceBelow),
    top: rect.bottom + MENU_GAP,
    bottom: window.innerHeight - rect.top + MENU_GAP,
  }
}

export function Select<T extends string>({ value, options, onChange, ariaLabel, invalid = false }: SelectProps<T>) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const listId = useId()

  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<MenuPosition | null>(null)
  const [activeIndex, setActiveIndex] = useState(() =>
    Math.max(
      0,
      options.findIndex((option) => option.value === value),
    ),
  )

  const selected = options.find((option) => option.value === value) ?? options[0]!

  // Measured in the click handler rather than in an effect: the geometry is
  // available at the moment the user asks for the menu.
  const show = useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger) return
    setPosition(measureMenu(trigger))
    setActiveIndex(
      Math.max(
        0,
        options.findIndex((option) => option.value === value),
      ),
    )
    setOpen(true)
  }, [options, value])

  useEffect(() => {
    if (!open) return

    function isInside(target: Node) {
      return triggerRef.current?.contains(target) === true || listRef.current?.contains(target) === true
    }
    function onPointerDown(event: MouseEvent) {
      if (!isInside(event.target as Node)) setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    // The dialog scrolls and the page can resize or scroll under the menu, all
    // of which move the trigger without any React render.
    function reposition() {
      if (triggerRef.current) setPosition(measureMenu(triggerRef.current))
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    // The dialog can still be settling when the click lands (fonts, the sheet's
    // own scroll-in), which leaves the first measurement a few pixels stale.
    const frame = requestAnimationFrame(reposition)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
  }, [open])

  function choose(index: number) {
    const option = options[index]
    if (option) {
      onChange(option.value)
    }
    setOpen(false)
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (!open && (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault()
      show()
      return
    }
    if (!open) return

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        setActiveIndex((index) => Math.min(options.length - 1, index + 1))
        break
      case 'ArrowUp':
        event.preventDefault()
        setActiveIndex((index) => Math.max(0, index - 1))
        break
      case 'Home':
        event.preventDefault()
        setActiveIndex(0)
        break
      case 'End':
        event.preventDefault()
        setActiveIndex(options.length - 1)
        break
      case 'Enter':
      case ' ':
        event.preventDefault()
        choose(activeIndex)
        break
      default:
        break
    }
  }

  const menu =
    open && position ? (
      <ul
        className="cs-selectfield__list is-portal"
        style={{
          left: position.left,
          width: position.width,
          maxHeight: position.maxHeight,
          // Anchored by whichever edge faces away from the trigger, so the menu
          // never grows across it.
          ...(position.above ? { bottom: position.bottom } : { top: position.top }),
        }}
        id={listId}
        role="listbox"
        aria-label={ariaLabel}
        aria-activedescendant={`${listId}-${activeIndex}`}
        ref={listRef}
        tabIndex={-1}
      >
        {options.map((option, index) => (
          <li
            key={option.value}
            id={`${listId}-${index}`}
            role="option"
            aria-selected={option.value === value}
            className={`cs-selectfield__option ${index === activeIndex ? 'is-active' : ''}`}
            onMouseEnter={() => setActiveIndex(index)}
            onClick={() => choose(index)}
          >
            {option.value === value ? <CheckIcon className="cs-selectfield__check" /> : null}
            <span>{option.label}</span>
          </li>
        ))}
      </ul>
    ) : null

  return (
    <div className="cs-selectfield">
      <button
        ref={triggerRef}
        type="button"
        className={`cs-selectfield__trigger ${invalid ? 'is-invalid' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        onClick={() => {
          if (open) {
            setOpen(false)
          } else {
            show()
          }
        }}
        onKeyDown={handleKeyDown}
      >
        <span>{selected.label}</span>
        <ChevronDownIcon className={`cs-selectfield__caret ${open ? 'is-open' : ''}`} />
      </button>

      {menu ? createPortal(menu, document.body) : null}
    </div>
  )
}

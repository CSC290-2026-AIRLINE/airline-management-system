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
  /**
   * Show a filter box once the list is at least this long. A handful of options is
   * faster to scan than to type into; a list of every country is not.
   */
  filterThreshold?: number
}

const DEFAULT_FILTER_THRESHOLD = 12

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

export function Select<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  invalid = false,
  filterThreshold = DEFAULT_FILTER_THRESHOLD,
}: SelectProps<T>) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const filterRef = useRef<HTMLInputElement>(null)
  const listId = useId()

  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<MenuPosition | null>(null)
  const [activeIndex, setActiveIndex] = useState(() =>
    Math.max(
      0,
      options.findIndex((option) => option.value === value),
    ),
  )
  const [filter, setFilter] = useState('')

  const filterable = options.length >= filterThreshold

  // Recomputed per render rather than memoised: it only runs while the menu is open,
  // and a few hundred `includes` calls per keystroke is not a cost worth caching.
  const needle = filter.trim().toLowerCase()
  const visible =
    filterable && needle !== ''
      ? options.filter((option) => option.label.toLowerCase().includes(needle) || option.value.toLowerCase().includes(needle))
      : options

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
    setFilter('')
    setOpen(true)
  }, [options, value])

  // A long list is unusable by scrolling alone, so the filter takes focus as soon
  // as the menu opens. A short list keeps focus on the trigger, where the arrow
  // keys already navigate.
  useEffect(() => {
    if (open && filterable) {
      filterRef.current?.focus()
    }
  }, [open, filterable])

  useEffect(() => {
    if (!open) return

    function isInside(target: Node) {
      return (
        triggerRef.current?.contains(target) === true ||
        menuRef.current?.contains(target) === true ||
        listRef.current?.contains(target) === true
      )
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

  /** Keeps the highlighted option in view — the list can be far longer than the menu. */
  function scrollActiveIntoView(index: number) {
    requestAnimationFrame(() => {
      listRef.current?.children[index]?.scrollIntoView({ block: 'nearest' })
    })
  }

  function choose(index: number) {
    const option = visible[index]
    if (option) {
      onChange(option.value)
    }
    setOpen(false)
  }

  /**
   * Arrow/Home/End/Enter handling, shared by the trigger and the option list so both
   * behave identically. The bound is the last *visible* option, which is not
   * `options.length` once a filter has narrowed the list.
   */
  function move(event: React.KeyboardEvent, current: number, select: (index: number) => void) {
    const last = Math.max(0, visible.length - 1)

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        step(Math.min(last, current + 1))
        break
      case 'ArrowUp':
        event.preventDefault()
        step(Math.max(0, current - 1))
        break
      case 'Home':
        event.preventDefault()
        step(0)
        break
      case 'End':
        event.preventDefault()
        step(last)
        break
      case 'Enter':
      case ' ':
        event.preventDefault()
        select(current)
        break
      default:
        break
    }

    function step(index: number) {
      setActiveIndex(index)
      scrollActiveIntoView(index)
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (!open && (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault()
      show()
      return
    }
    if (!open) return
    move(event, activeIndex, choose)
  }

  /** Arrows/Enter while the option list itself has focus, which is where a long list moves focus. */
  function handleListKeyDown(event: React.KeyboardEvent<HTMLUListElement>) {
    // No `stopPropagation` here: the document listener closes the menu on Escape,
    // and React dispatches at the root container before the document phase, so
    // stopping it would make Escape stop working once the list has focus.
    move(event, activeIndex, choose)
  }

  /** Enter or ArrowDown in the filter box: jump into the options, or take the first match. */
  function handleFilterKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'Enter') {
      event.preventDefault()
      if (visible.length === 0) return
      setActiveIndex(0)
      if (event.key === 'Enter') {
        choose(0)
      } else {
        listRef.current?.focus()
      }
    }
  }

  const menuStyle = position
    ? {
        left: position.left,
        width: position.width,
        maxHeight: position.maxHeight,
        // Anchored by whichever edge faces away from the trigger, so the menu
        // never grows across it.
        ...(position.above ? { bottom: position.bottom } : { top: position.top }),
      }
    : undefined

  const menu =
    open && position ? (
      <div className="cs-selectfield__menu is-portal" style={menuStyle} ref={menuRef}>
        {filterable ? (
          <input
            ref={filterRef}
            type="text"
            className="cs-selectfield__filter"
            value={filter}
            placeholder="Type to filter…"
            aria-label={`Filter ${ariaLabel}`}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => {
              setFilter(event.target.value)
              setActiveIndex(0)
            }}
            onKeyDown={handleFilterKeyDown}
          />
        ) : null}

        <ul
          className="cs-selectfield__list"
          id={listId}
          role="listbox"
          aria-label={ariaLabel}
          // Only points at a real option; an empty filtered list has none.
          aria-activedescendant={visible.length > 0 ? `${listId}-${activeIndex}` : undefined}
          ref={listRef}
          tabIndex={-1}
          onKeyDown={handleListKeyDown}
        >
          {visible.map((option, index) => (
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

        {visible.length === 0 ? <p className="cs-selectfield__empty">No match for “{filter.trim()}”</p> : null}
      </div>
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

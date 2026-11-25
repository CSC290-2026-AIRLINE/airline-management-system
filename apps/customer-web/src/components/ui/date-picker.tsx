import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { CalendarDaysIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { Popover } from 'radix-ui'
import {
  addDays,
  addMonths,
  addYears,
  calendarWeeks,
  calendarYears,
  clampKey,
  fromKey,
  isSelectable,
  monthStart,
  spokenDate,
  todayKey,
  toKey,
  weekdayIndex,
} from './date-keys'
import { cn } from '@customer-web/lib/utils'
import { controlClass } from './control'

/**
 * The shared date field. It replaces the browser's own `input[type="date"]`, whose text box and calendar popup cannot
 * be styled, so every date in the product looks the same: one field with a calendar icon, and one calendar popup with
 * a month grid.
 *
 * The date travels as a plain `YYYY-MM-DD` string, the same shape the API and the URL use. Dates are read and written
 * in the local time zone, so a date never moves a day because of the offset.
 *
 * The staff console is meant to reuse this component through the `@customer-web/*` alias, so the calendar looks the same
 * in both apps. It does not yet: the staff console still uses the browser's own date boxes. The colours below come from
 * variables with a fallback, because the calendar popup is portalled to the body and cannot read the page-scoped
 * variables.
 */

/** The months and the weekdays in the order the calendar shows them: Monday first, like the rest of the product. */
const MONTHS = Array.from({ length: 12 }, (_, index) =>
  new Intl.DateTimeFormat('en-GB', { month: 'long' }).format(new Date(2024, index, 1)),
)
const WEEKDAYS = Array.from({ length: 7 }, (_, index) =>
  new Intl.DateTimeFormat('en-GB', { weekday: 'short' }).format(new Date(2024, 0, 1 + index)),
)

const longDate = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const shortDate = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })

export interface DatePickerProps {
  /** The chosen date as `YYYY-MM-DD`, or `''` when nothing is chosen. */
  value: string
  /** Called with the chosen date, or `''` when the date is cleared. */
  onChange: (value: string) => void
  /** The earliest date that can be chosen, as `YYYY-MM-DD`. */
  min?: string
  /** The latest date that can be chosen, as `YYYY-MM-DD`. */
  max?: string
  /** The text shown when nothing is chosen. */
  placeholder?: string
  /** The name of the field for assistive technology. */
  ariaLabel?: string
  /** The id of the label that names the field, when the label is the visible one. */
  ariaLabelledBy?: string
  /** The id of the element that describes the field, usually an error message. */
  describedBy?: string
  /** The id of the field. */
  id?: string
  /** Marks the field as invalid. The error text itself comes from the page. */
  invalid?: boolean
  /** Marks the field as required. The check itself is done by the page's own validation. */
  required?: boolean
  disabled?: boolean
  /** Shows the date without a calendar, for a value the page fills in itself. */
  readOnly?: boolean
  /** Allows the date to be cleared from the calendar. */
  clearable?: boolean
  /**
   * The element the calendar is rendered into. A popup portalled to the body is painted under a modal dialog, because
   * the dialog sits in the browser's top layer, so a field inside a dialog passes the dialog element here.
   */
  popupContainer?: HTMLElement | null
  /** Extra class names for the field. */
  className?: string
}

export function DatePicker({
  value,
  onChange,
  min,
  max,
  placeholder = 'Select date',
  ariaLabel,
  ariaLabelledBy,
  describedBy,
  id,
  invalid,
  required,
  disabled,
  readOnly,
  clearable,
  popupContainer,
  className,
}: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const [focused, setFocused] = useState(value || todayKey())
  const [view, setView] = useState(() => monthStart(value || todayKey()))
  const gridRef = useRef<HTMLDivElement>(null)

  const earliest = min || undefined
  const latest = max || undefined

  /** Whether a day can be chosen. */
  const selectable = useCallback((key: string) => isSelectable(key, earliest, latest), [earliest, latest])

  /** Keeps a date inside the allowed range, so the calendar never focuses a day that cannot be chosen. */
  const clamp = useCallback((key: string) => clampKey(key, earliest, latest), [earliest, latest])

  const weeks = useMemo(() => calendarWeeks(view, earliest, latest), [view, earliest, latest])

  const years = useMemo(() => calendarYears(earliest, latest), [earliest, latest])

  /** Moves the focus to a day and shows the month it is in. */
  const focusDay = useCallback(
    (key: string) => {
      const next = clamp(key)
      setFocused(next)
      setView(monthStart(next))
    },
    [clamp],
  )

  /** Shows another month and keeps the focus on a day that can be chosen there. */
  const showMonth = useCallback(
    (monthKey: string) => {
      const date = fromKey(monthKey)
      /* The year select only offers the years the field allows, so the month cannot leave them. */
      const year = Math.min(Math.max(date.getFullYear(), years[0]), years[years.length - 1])
      const target = toKey(new Date(year, date.getMonth(), 1))
      setView(target)
      const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
      const day = Math.min(Math.max(fromKey(focused).getDate(), 1), lastDay)
      const candidate = toKey(new Date(year, date.getMonth(), day))
      if (selectable(candidate)) {
        setFocused(candidate)
        return
      }
      /* The day the focus was on is not allowed in this month, so the first day that is allowed takes the focus. */
      const firstAllowed = calendarWeeks(target, earliest, latest)
        .flat()
        .find((day) => day.inMonth && !day.disabled)
      if (firstAllowed) setFocused(firstAllowed.key)
    },
    [focused, selectable, earliest, latest, years],
  )

  /** Puts the focus on the day the calendar is showing. */
  useEffect(() => {
    if (!open) return
    const button = gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${focused}"]`)
    button?.focus()
  }, [open, focused])

  const viewedMonth = fromKey(view).getMonth()
  const viewedYear = fromKey(view).getFullYear()
  const today = todayKey()
  const label = value ? shortDate.format(fromKey(value)) : ''
  /* The trigger is a button, so its name comes from the visible label with `aria-labelledby`. The chosen day is part of
     that name as well, because a button that is named by `aria-labelledby` does not read out its own text. It is added
     with a hidden line, so the name is the label and the day, whatever the page shows. */
  const spokenId = useId()
  const triggerLabel = ariaLabelledBy ? undefined : ariaLabel
  const triggerName = ariaLabelledBy ? `${ariaLabelledBy} ${spokenId}` : undefined

  /** The keyboard: the arrows move by a day and a week, Page Up and Down by a month, Shift and Page by a year. */
  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'ArrowLeft') focusDay(addDays(focused, -1))
    else if (event.key === 'ArrowRight') focusDay(addDays(focused, 1))
    else if (event.key === 'ArrowUp') focusDay(addDays(focused, -7))
    else if (event.key === 'ArrowDown') focusDay(addDays(focused, 7))
    else if (event.key === 'Home') focusDay(addDays(focused, -weekdayIndex(focused)))
    else if (event.key === 'End') focusDay(addDays(focused, 6 - weekdayIndex(focused)))
    else if (event.key === 'PageUp') focusDay(event.shiftKey ? addYears(focused, -1) : addMonths(focused, -1))
    else if (event.key === 'PageDown') focusDay(event.shiftKey ? addYears(focused, 1) : addMonths(focused, 1))
    else return
    event.preventDefault()
  }

  function choose(key: string) {
    onChange(key)
    setOpen(false)
  }

  /** Opens the calendar on the chosen day, or on today when there is nothing chosen yet. */
  function openCalendar(nextOpen: boolean) {
    if (nextOpen) {
      const start = clamp(value || todayKey())
      setFocused(start)
      setView(monthStart(start))
    }
    setOpen(nextOpen)
  }

  if (readOnly) {
    return (
      <input
        id={id}
        type="text"
        data-slot="date-picker-static"
        className={cn(controlClass, 'flex h-11 items-center gap-2 text-left cursor-default bg-muted', className)}
        value={label}
        readOnly
        aria-label={triggerLabel}
        aria-labelledby={ariaLabelledBy}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
      />
    )
  }

  return (
    <Popover.Root open={open} onOpenChange={openCalendar}>
      <Popover.Trigger asChild>
        <button
          id={id}
          type="button"
          data-slot="date-picker-trigger"
          className={cn(controlClass, 'flex h-11 items-center gap-2 text-left cursor-pointer', className)}
          aria-label={triggerLabel}
          aria-labelledby={triggerName}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          data-required={required || undefined}
          disabled={disabled}
        >
          <span className={cn('flex-1 truncate', !value && 'text-muted-foreground')}>{value ? label : placeholder}</span>
          <span className="sr-only" id={spokenId}>
            {spokenDate(value)}
          </span>
          <CalendarDaysIcon className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </Popover.Trigger>
      <Popover.Portal container={popupContainer}>
        <Popover.Content
          className="z-50 w-72 rounded-md border bg-popover p-3 text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
          sideOffset={6}
          collisionPadding={12}
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            const button = gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${focused}"]`)
            button?.focus()
          }}
          aria-label="Choose a date"
        >
          <div className="mb-2 flex items-center justify-between gap-1">
            <button
              type="button"
              className="inline-flex size-7 cursor-pointer items-center justify-center rounded-md border bg-background outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 [&_svg]:size-4"
              aria-label="Previous month"
              onClick={() => showMonth(addMonths(view, -1))}
            >
              <ChevronLeftIcon />
            </button>
            <div className="flex items-center gap-1">
              <select
                className="h-7 cursor-pointer rounded-md border border-input bg-background px-1.5 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                aria-label="Month"
                value={viewedMonth}
                onChange={(event) => {
                  const date = fromKey(view)
                  showMonth(toKey(new Date(date.getFullYear(), Number(event.target.value), 1)))
                }}
              >
                {MONTHS.map((month, index) => (
                  <option key={month} value={index}>
                    {month}
                  </option>
                ))}
              </select>
              <select
                className="h-7 cursor-pointer rounded-md border border-input bg-background px-1.5 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                aria-label="Year"
                value={viewedYear}
                onChange={(event) => {
                  const date = fromKey(view)
                  showMonth(toKey(new Date(Number(event.target.value), date.getMonth(), 1)))
                }}
              >
                {years.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="inline-flex size-7 cursor-pointer items-center justify-center rounded-md border bg-background outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 [&_svg]:size-4"
              aria-label="Next month"
              onClick={() => showMonth(addMonths(view, 1))}
            >
              <ChevronRightIcon />
            </button>
          </div>
          <div className="grid grid-cols-7 text-center text-xs font-normal text-muted-foreground" aria-hidden="true">
            {WEEKDAYS.map((weekday) => (
              <span key={weekday}>{weekday}</span>
            ))}
          </div>
          <div className="mt-1 grid gap-0.5" role="grid" aria-label="Calendar" ref={gridRef} onKeyDown={onKeyDown}>
            {weeks.map((week, weekIndex) => (
              <div className="grid grid-cols-7" role="row" key={weekIndex}>
                {week.map((day) => (
                  <div className="flex justify-center" role="gridcell" key={day.key}>
                    <button
                      type="button"
                      data-day={day.key}
                      className={cn(
                        'size-8 cursor-pointer rounded-md text-sm tabular-nums outline-none hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent',
                        !day.inMonth && 'text-muted-foreground opacity-60',
                        day.key === today && 'bg-accent font-semibold',
                        day.key === value && 'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground',
                      )}
                      tabIndex={day.key === focused ? 0 : -1}
                      disabled={day.disabled}
                      aria-label={longDate.format(fromKey(day.key))}
                      aria-pressed={day.key === value}
                      aria-current={day.key === today ? 'date' : undefined}
                      onClick={() => choose(day.key)}
                      onFocus={() => setFocused(day.key)}
                    >
                      {day.day}
                    </button>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between gap-2 border-t pt-2">
            <button
              type="button"
              className="h-7 cursor-pointer rounded-md px-2 text-sm font-medium text-primary outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!selectable(today)}
              onClick={() => choose(today)}
            >
              Today
            </button>
            {clearable && (
              <button
                type="button"
                className="h-7 cursor-pointer rounded-md px-2 text-sm font-medium text-primary outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => {
                  onChange('')
                  setOpen(false)
                }}
              >
                Clear
              </button>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

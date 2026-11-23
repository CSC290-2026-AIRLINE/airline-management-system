import { Input } from '@staff-web/components/ui/input'
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Check, ChevronDown, ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { Alert, AlertDescription } from '@staff-web/components/ui/alert'
import { Badge } from '@staff-web/components/ui/badge'
import { Button } from '@staff-web/components/ui/button'
import { Card } from '@staff-web/components/ui/card'
import { Label } from '@staff-web/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@staff-web/components/ui/popover'
import { Skeleton } from '@staff-web/components/ui/skeleton'
import { SelectContent, SelectItem, SelectTrigger, SelectValue, Select } from '@staff-web/components/ui/select'
import { cn } from '@staff-web/lib/utils'
import type { PillTone } from '../constants'
import { useDesk } from '../hooks/useBaggageDesk'

/**
 * Small building blocks shared by the Feature 10 staff screens, styled to the F10 Figma frames (staff-web · Desktop 1440).
 * They wrap the shadcn components so the screens keep the app's focus and keyboard behaviour.
 */

const PILL_VARIANTS: Record<PillTone, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  amber: 'outline',
  grey: 'secondary',
  red: 'destructive',
  green: 'default',
}

/** A status badge. */
export function Pill({ tone, children }: { tone: PillTone; children: ReactNode }) {
  return <Badge variant={PILL_VARIANTS[tone]}>{children}</Badge>
}

/** The shadcn Card, with the padding the staff cards share. */
export function F10Card({ className, children, ...props }: React.ComponentProps<'div'>) {
  return (
    <Card className={cn('gap-4 p-5', className)} {...props}>
      {children}
    </Card>
  )
}

/** "Field / …": label above a control. */
export function Field({
  label,
  htmlFor,
  children,
  className,
}: {
  label: string
  htmlFor: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex min-w-0 flex-1 flex-col gap-2', className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  )
}

export interface Option {
  value: string
  label: string
}

/** A dropdown: the shadcn Select. */
export function SelectBox({
  id,
  value,
  onValueChange,
  options,
  placeholder,
  disabled,
}: {
  id: string
  value: string
  onValueChange: (value: string) => void
  options: Option[]
  placeholder?: string
  disabled?: boolean
}) {
  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent
        position="popper"
        side="bottom"
        align="start"
        className="max-h-[min(18rem,var(--radix-select-content-available-height))] font-sans"
      >
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** Words typed in the search box must all appear in the label, in any order, ignoring case. */
function matchesSearch(label: string, query: string): boolean {
  const text = label.toLowerCase()
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => text.includes(word))
}

/** A SelectBox for long lists: the list opens below the box with a search field on top. */
export function SearchSelectBox({
  id,
  value,
  onValueChange,
  options,
  placeholder,
  searchPlaceholder = 'Type to search',
  disabled,
}: {
  id: string
  value: string
  onValueChange: (value: string) => void
  options: Option[]
  placeholder?: string
  searchPlaceholder?: string
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLUListElement>(null)
  const listId = useId()

  const shown = options.filter((o) => matchesSearch(o.label, query))
  const current = options.find((o) => o.value === value)
  const activeIndex = Math.min(active, Math.max(shown.length - 1, 0))

  function changeOpen(next: boolean) {
    setOpen(next)
    setQuery('')
    setActive(0)
  }

  function choose(option: Option) {
    onValueChange(option.value)
    changeOpen(false)
  }

  function moveTo(index: number) {
    setActive(index)
    listRef.current?.querySelector(`[data-index="${index}"]`)?.scrollIntoView({ block: 'nearest' })
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' && shown.length > 0) {
      event.preventDefault()
      moveTo(Math.min(activeIndex + 1, shown.length - 1))
    } else if (event.key === 'ArrowUp' && shown.length > 0) {
      event.preventDefault()
      moveTo(Math.max(activeIndex - 1, 0))
    } else if (event.key === 'Enter' && shown[activeIndex]) {
      event.preventDefault()
      choose(shown[activeIndex])
    }
  }

  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <Button id={id} type="button" variant="outline" className="w-full justify-between font-normal">
          <span className={cn('min-w-0 truncate', !current && 'text-muted-foreground')}>{current ? current.label : placeholder}</span>
          <ChevronDown className="size-4 shrink-0 opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        avoidCollisions={false}
        className="flex w-(--radix-popover-trigger-width) min-w-[16rem] flex-col gap-1 p-1 font-sans"
      >
        <div className="flex items-center gap-2 border-b border-border px-2.5 py-2">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <Input
            autoFocus
            value={query}
            onChange={(event) => {
              setQuery(event.currentTarget.value)
              setActive(0)
            }}
            onKeyDown={onKeyDown}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            role="combobox"
            aria-expanded
            aria-controls={listId}
            aria-activedescendant={shown[activeIndex] ? `${listId}-${activeIndex}` : undefined}
            className="h-auto min-w-0 flex-1 border-0 bg-transparent p-0 shadow-none focus-visible:ring-0 dark:bg-transparent"
          />
        </div>
        {shown.length === 0 ? (
          <p className="px-2.5 py-2 text-sm text-muted-foreground">Nothing matches your search.</p>
        ) : (
          <ul ref={listRef} id={listId} role="listbox" className="m-0 max-h-[min(16rem,40vh)] list-none overflow-y-auto p-0">
            {shown.map((o, index) => (
              <li
                key={o.value}
                id={`${listId}-${index}`}
                data-index={index}
                role="option"
                aria-selected={o.value === value}
                onMouseMove={() => setActive(index)}
                onClick={() => choose(o)}
                className={cn(
                  'flex cursor-default items-center justify-between gap-2 rounded-sm px-2.5 py-1.5 text-sm text-foreground select-none',
                  index === activeIndex && 'bg-accent',
                )}
              >
                <span className="min-w-0 break-words">{o.label}</span>
                {o.value === value && <Check className="size-4 shrink-0" aria-hidden />}
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  )
}

/** "Chip / …" status filter. */
export function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <Button type="button" size="sm" variant={active ? 'default' : 'outline'} aria-pressed={active} onClick={onClick}>
      {children}
    </Button>
  )
}

/** Inline error under a form, in the danger palette. */
export function FormError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <Alert variant="destructive">
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  )
}

/** "1–20 of 57" with Previous and Next under a list. Hidden when everything fits on one page. */
export function Pager({
  page,
  pageCount,
  total,
  pageSize,
  label,
  onPage,
}: {
  page: number
  pageCount: number
  total: number
  pageSize: number
  /** What the list holds, for screen readers: "Found bags pages". */
  label: string
  onPage: (page: number) => void
}) {
  if (pageCount <= 1) return null
  const first = page * pageSize + 1
  const last = Math.min(total, (page + 1) * pageSize)

  return (
    <nav aria-label={label} className="flex items-center justify-between gap-3 px-6 py-2 max-md:px-0">
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {first}–{last} of {total}
      </p>
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" disabled={page === 0} onClick={() => onPage(page - 1)}>
          Previous
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={page >= pageCount - 1} onClick={() => onPage(page + 1)}>
          Next
        </Button>
      </div>
    </nav>
  )
}

/**
 * Classes for a list card. On phones the box goes away and each row becomes a card of its own (F10 staff mobile
 * frames); `LIST_PAD` keeps the header in line with those cards.
 */
export const LIST_CARD = 'gap-3 px-0 pt-5 pb-2 max-md:border-0 max-md:bg-transparent max-md:p-0'
export const LIST_PAD = 'px-6 max-md:px-0'

/** One row of a list on phones: a white card with a title, a status pill and up to two lines under it. */
export function MobileRow({
  title,
  pill,
  line,
  meta,
  selected,
  onSelect,
}: {
  title: ReactNode
  pill?: ReactNode
  line?: ReactNode
  meta?: ReactNode
  selected: boolean
  onSelect: () => void
}) {
  return (
    <li>
      <Button
        variant="ghost"
        type="button"
        aria-current={selected || undefined}
        onClick={onSelect}
        className={cn(
          'h-auto justify-start gap-0 px-0 py-0 font-normal whitespace-normal hover:bg-transparent dark:hover:bg-transparent',
          'flex w-full items-center gap-2 rounded-xl border bg-card p-4 text-left shadow-sm',
          selected && 'border-primary',
        )}
      >
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex items-start justify-between gap-2">
            <span className="min-w-0 font-medium break-words">{title}</span>
            {pill}
          </span>
          {line && <span className="truncate text-sm text-foreground">{line}</span>}
          {meta && <span className="truncate text-xs text-muted-foreground">{meta}</span>}
        </span>
        <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      </Button>
    </li>
  )
}

/** The rows of a list on phones; tables stay for wider screens. `empty` shows when there are no rows and no error. */
export function MobileList({
  label,
  loading,
  empty,
  children,
}: {
  label: string
  loading: boolean
  empty: string | null
  children: ReactNode
}) {
  return (
    <ul aria-label={label} className="flex flex-col gap-3 md:hidden">
      {loading ? (
        [0, 1, 2].map((i) => (
          <li key={i}>
            <Skeleton className="h-[84px] w-full rounded-xl" />
          </li>
        ))
      ) : empty ? (
        <li className="rounded-xl border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">{empty}</li>
      ) : (
        children
      )}
    </ul>
  )
}

/** "< Lost bag cases": back from a detail to its list on phones, where the two do not fit side by side. */
export function BackLink({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <Button variant="ghost" size="sm" type="button" onClick={onBack} className="self-start md:hidden">
      <ChevronLeft aria-hidden />
      {label}
    </Button>
  )
}

const SIM_DAY = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

/** "Simulated today · Wed 21 Oct 2026, 10:30" under a page title: the desk works on the simulation clock, not real time. */
export function SimulatedToday() {
  const { now } = useDesk()
  if (!now) return null
  return (
    <Badge variant="outline" className="self-start font-normal">
      Simulated today · {SIM_DAY.format(now)}
    </Badge>
  )
}

/** "Status  [All] [Open] …": a labelled row of chips. On phones the label sits on top and the chips scroll sideways. */
export function FilterRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-2 max-md:flex-col max-md:items-stretch">
      <span className="w-[90px] text-sm font-medium text-muted-foreground">{label}</span>
      <div className="flex min-w-0 flex-1 flex-wrap gap-2 max-md:-mx-4 max-md:flex-nowrap max-md:overflow-x-auto max-md:px-4 max-md:pb-1 [&>*]:shrink-0">
        {children}
      </div>
    </div>
  )
}

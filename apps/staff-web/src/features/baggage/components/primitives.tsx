import type { ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@staff-web/components/ui/button'
import { Label } from '@staff-web/components/ui/label'
import { Skeleton } from '@staff-web/components/ui/skeleton'
import { SelectContent, SelectItem, SelectTrigger, SelectValue, Select } from '@staff-web/components/ui/select'
import { cn } from '@staff-web/lib/utils'
import type { PillTone } from '../constants'
import { useDesk } from '../hooks/useBaggageDesk'

/**
 * Small building blocks shared by the Feature 10 staff screens, styled to the F10 Figma frames (staff-web · Desktop 1440).
 * They wrap the shadcn components so the screens keep the app's focus and keyboard behaviour.
 */

const PILL_TONES: Record<PillTone, string> = {
  amber: 'bg-[#fff4de] text-[#7a4e00]',
  grey: 'bg-[#e6eaf2] text-[#14213d]',
  red: 'bg-[#fdecec] text-[#d61313]',
  green: 'bg-success-soft text-success-strong',
}

/** "F10 / Pill" */
export function Pill({ tone, children }: { tone: PillTone; children: ReactNode }) {
  return (
    <span className={cn('inline-flex shrink-0 rounded-full px-2.5 py-[3px] text-xs whitespace-nowrap', PILL_TONES[tone])}>{children}</span>
  )
}

/** White card with the 12px radius and slate border used by every F10 staff card. */
export function F10Card({ className, children, ...props }: React.ComponentProps<'section'>) {
  return (
    <section className={cn('flex flex-col gap-4 rounded-xl border border-[#cbd5e1] bg-white p-5', className)} {...props}>
      {children}
    </section>
  )
}

/** Classes for the "Box" of a text field: 46px tall, light fill, 8px radius. */
export const FIELD_BOX =
  'h-auto min-h-[46px] w-full rounded-lg border-[#d8dce6] bg-[#f8fafc] px-3.5 py-[11px] text-base leading-normal text-[#14213d] shadow-none placeholder:text-[#b8bcca] md:text-base'

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
    <div className={cn('flex min-w-0 flex-1 flex-col gap-1.5', className)}>
      <Label htmlFor={htmlFor} className="text-sm leading-normal font-medium text-[#47494f]">
        {label}
      </Label>
      {children}
    </div>
  )
}

export interface Option {
  value: string
  label: string
}

/** A field box that opens a list (Figma's box with the chevron-down icon). */
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
      <SelectTrigger id={id} className={cn(FIELD_BOX, 'data-[size=default]:h-auto [&_svg:not([class*=text-])]:text-[#14213d]')}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** "Chip / …" status filter. */
export function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'rounded-full border px-3.5 py-1.5 text-sm leading-normal font-semibold outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
        active ? 'border-[#14213d] bg-[#14213d] text-white' : 'border-[#d8dce6] bg-white text-[#14213d] hover:bg-[#f4f6fa]',
      )}
    >
      {children}
    </button>
  )
}

/** Inline error under a form, in the danger palette. */
export function FormError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
      {message}
    </p>
  )
}

const PAGER_BUTTON = 'h-auto rounded-lg border-[#d8dce6] px-3 py-1.5 text-sm leading-normal font-semibold text-[#14213d]'

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
    <nav aria-label={label} className="flex items-center justify-between gap-3 px-5 py-2 max-md:px-0">
      <p className="text-sm text-[#677287]" aria-live="polite">
        {first}–{last} of {total}
      </p>
      <div className="flex gap-2">
        <Button type="button" variant="outline" disabled={page === 0} onClick={() => onPage(page - 1)} className={PAGER_BUTTON}>
          Previous
        </Button>
        <Button type="button" variant="outline" disabled={page >= pageCount - 1} onClick={() => onPage(page + 1)} className={PAGER_BUTTON}>
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
export const LIST_PAD = 'px-5 max-md:px-0'

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
      <button
        type="button"
        aria-current={selected || undefined}
        onClick={onSelect}
        className={cn(
          'flex w-full items-center gap-2 rounded-xl border bg-white p-4 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
          selected ? 'border-[#14213d]' : 'border-[#cbd5e1]',
        )}
      >
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex items-start justify-between gap-2">
            <span className="min-w-0 text-base break-words text-[#14213d]">{title}</span>
            {pill}
          </span>
          {line && <span className="truncate text-sm text-[#14213d]">{line}</span>}
          {meta && <span className="truncate text-xs text-[#677287]">{meta}</span>}
        </span>
        <ChevronRight aria-hidden className="size-4 shrink-0 text-[#677287]" />
      </button>
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
        <li className="rounded-xl border border-[#cbd5e1] bg-white px-4 py-6 text-center text-sm text-[#677287]">{empty}</li>
      ) : (
        children
      )}
    </ul>
  )
}

/** "< Lost bag cases": back from a detail to its list on phones, where the two do not fit side by side. */
export function BackLink({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="flex items-center gap-1.5 self-start rounded text-sm font-semibold text-[#14213d] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 md:hidden"
    >
      <ChevronLeft aria-hidden className="size-4" />
      {label}
    </button>
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

/** "Simulated today · Wed 21 Oct 2026, 10:30" under a page title on phones, where the sidebar clock is hidden. */
export function SimulatedToday() {
  const { now } = useDesk()
  if (!now) return null
  return (
    <p className="self-start rounded-md border border-[#d8dce6] bg-white px-2 py-1 text-xs text-[#677287] md:hidden">
      Simulated today · {SIM_DAY.format(now)}
    </p>
  )
}

/** "Status  [All] [Open] …": a labelled row of chips. On phones the label sits on top and the chips scroll sideways. */
export function FilterRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-2 max-md:flex-col max-md:items-stretch">
      <span className="w-[90px] text-sm font-medium text-[#677287]">{label}</span>
      <div className="flex min-w-0 flex-1 flex-wrap gap-2 max-md:-mx-4 max-md:flex-nowrap max-md:overflow-x-auto max-md:px-4 max-md:pb-1 [&>*]:shrink-0">
        {children}
      </div>
    </div>
  )
}

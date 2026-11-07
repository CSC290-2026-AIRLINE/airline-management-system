import type { ReactNode } from 'react'
import { Label } from '@staff-web/components/ui/label'
import { SelectContent, SelectItem, SelectTrigger, SelectValue, Select } from '@staff-web/components/ui/select'
import { cn } from '@staff-web/lib/utils'
import type { PillTone } from '../constants'

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

/**
 * Shared UI primitives for the build-pairings feature.
 *
 * These are the components the design spec names explicitly (`<PrimaryButton>`,
 * `<OutlineButton>`, `<HighlightButton>`, `<DangerButton>`, `<InputField>`,
 * `<SelectDropdown>`, `<BaseModalOverlay>`). They live in the feature folder
 * rather than a global one until the other crew-rostering pages exist; when
 * they do, move this file up to `crew-rostering/shared/` unchanged.
 *
 * Icons are inline SVG because no icon package is installed.
 */
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'
import { useEffect, useId, useRef, useState } from 'react'

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'outline' | 'highlight' | 'danger'
  fullWidth?: boolean
}

const BUTTON_VARIANTS = {
  primary: 'bg-btn-navy text-white hover:bg-btn-navy-hover focus-visible:outline-btn-navy',
  outline: 'border border-border-desc bg-white text-primary-text hover:bg-page-bg focus-visible:outline-primary',
  highlight: 'bg-btn-yellow text-primary-text hover:bg-btn-yellow-hover focus-visible:outline-btn-yellow',
  danger: 'bg-invalid text-white hover:bg-btn-red-hover focus-visible:outline-invalid',
} as const

export function Button({ variant = 'primary', fullWidth = false, className = '', children, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      className={`${BUTTON_BASE} ${BUTTON_VARIANTS[variant]} px-4 py-2.5 ${fullWidth ? 'w-full' : ''} ${className}`}
    >
      {children}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Form fields
// ---------------------------------------------------------------------------

export function InputField({
  label,
  error,
  className = '',
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) {
  const id = useId()
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="text-xs font-medium text-border-desc">
        {label}
      </label>
      <input
        id={id}
        {...rest}
        aria-invalid={error ? true : undefined}
        className={`h-11 rounded-lg border bg-white px-3 text-sm text-primary-text outline-none transition-colors focus-visible:border-primary ${
          error ? 'border-invalid' : 'border-border-desc'
        }`}
      />
      {error && <p className="text-xs font-medium text-invalid">{error}</p>}
    </div>
  )
}

/**
 * A dropdown option. A bare string is both the value and the label; the object
 * form exists for filters that need `All bases` to mean the literal value `all`.
 */
export type SelectOption = string | { value: string; label: string }

function toOption(option: SelectOption): { value: string; label: string } {
  return typeof option === 'string' ? { value: option, label: option } : option
}

export function SelectDropdown({
  label,
  options,
  error,
  className = '',
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string; options: readonly SelectOption[]; error?: string }) {
  const id = useId()
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="text-xs font-medium text-border-desc">
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          {...rest}
          aria-invalid={error ? true : undefined}
          className={`h-11 w-full appearance-none rounded-lg border bg-white px-3 pr-9 text-sm font-medium text-primary-text outline-none transition-colors focus-visible:border-primary ${
            error ? 'border-invalid' : 'border-border-desc'
          }`}
        >
          {options.map((option) => {
            const { value, label: text } = toOption(option)
            return (
              <option key={value} value={value}>
                {text}
              </option>
            )
          })}
        </select>
        <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-primary-text" />
      </div>
      {error && <p className="text-xs font-medium text-invalid">{error}</p>}
    </div>
  )
}

/** Labelled `<input type="date">`. The browser renders it as `dd/mm/yyyy` in the locales that use it. */
export function DateField({
  label,
  error,
  className = '',
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) {
  const id = useId()
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="text-xs font-medium text-border-desc">
        {label}
      </label>
      <input
        id={id}
        type="date"
        {...rest}
        aria-invalid={error ? true : undefined}
        className={`h-11 rounded-lg border bg-white px-3 text-sm text-primary-text outline-none transition-colors focus-visible:border-primary ${
          error ? 'border-invalid' : 'border-border-desc'
        }`}
      />
      {error && <p className="text-xs font-medium text-invalid">{error}</p>}
    </div>
  )
}

/** Search box with a leading magnifier. `value` makes it controlled. */
export function SearchInput({
  value,
  onValueChange,
  placeholder,
  className = '',
}: {
  value: string
  onValueChange: (value: string) => void
  placeholder: string
  className?: string
}) {
  const id = useId()
  return (
    <div className={`relative ${className}`}>
      <label htmlFor={id} className="sr-only">
        {placeholder}
      </label>
      <SearchIcon className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-primary-text/50" />
      <input
        id={id}
        type="search"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        placeholder={placeholder}
        className="h-11 w-full rounded-lg border border-border-desc bg-white pr-3 pl-9 text-sm text-primary-text outline-none transition-colors focus-visible:border-primary"
      />
    </div>
  )
}

/**
 * Checkbox dropdown, used where a field holds several values (`Languages`).
 *
 * A native `<select multiple>` cannot be styled to match the rest of the form and
 * behaves badly on touch, so this is a button that reveals a list of checkboxes.
 * Escape and an outside click both close it.
 */
export function MultiSelect({
  label,
  options,
  selected,
  onChange,
  placeholder,
  hint,
  className = '',
}: {
  label: string
  options: readonly SelectOption[]
  selected: readonly string[]
  onChange: (values: string[]) => void
  placeholder: string
  hint?: string
  className?: string
}) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const items = options.map(toOption)
  const summary =
    selected.length === 0 ? placeholder : selected.map((value) => items.find((item) => item.value === value)?.label ?? value).join(', ')

  function toggle(value: string) {
    onChange(selected.includes(value) ? selected.filter((entry) => entry !== value) : [...selected, value])
  }

  return (
    <div ref={containerRef} className={`flex flex-col gap-1.5 ${className}`}>
      <span id={id} className="text-xs font-medium text-border-desc">
        {label}
      </span>
      <div className="relative">
        <button
          type="button"
          aria-labelledby={id}
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
          className="flex h-11 w-full items-center justify-between gap-2 rounded-lg border border-border-desc bg-white px-3 text-left text-sm outline-none transition-colors focus-visible:border-primary"
        >
          <span className={`truncate ${selected.length === 0 ? 'text-primary-text/50' : 'font-medium text-primary-text'}`}>{summary}</span>
          <ChevronDownIcon className={`h-4 w-4 shrink-0 text-primary-text transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>

        {open && (
          <div className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-border-desc bg-white py-1 shadow-lg">
            {items.map((item) => (
              <label
                key={item.value}
                className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm text-primary-text hover:bg-page-bg"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(item.value)}
                  onChange={() => toggle(item.value)}
                  className="h-4 w-4 accent-primary"
                />
                {item.label}
              </label>
            ))}
          </div>
        )}
      </div>
      {hint && <p className="text-xs text-primary-text/50">{hint}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Badges and banners
// ---------------------------------------------------------------------------

/** `Valid` / `Invalid` status pill. Colour follows `ui-style.md` (30% tint background). */
export function StatusBadge({ status }: { status: 'passed' | 'failed' }) {
  const valid = status === 'passed'
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
        valid ? 'bg-valid-bg text-valid' : 'bg-invalid-bg text-invalid'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${valid ? 'bg-valid' : 'bg-invalid'}`} />
      {valid ? 'Valid' : 'Invalid'}
    </span>
  )
}

/**
 * Notice used for save, delete and publish confirmations. On small screens it floats
 * above the commit footer as a toast; from `sm` up it sits inline in the flow.
 *
 * `action` is the call to action that rides along with the notice — publish-publish and
 * "start next run" — so an operator who has to fix something is not left hunting for the
 * button that acts on it.
 */
export function AlertBanner({ tone, action, children }: { tone: 'success' | 'warning' | 'info'; action?: ReactNode; children: ReactNode }) {
  const styles = {
    success: 'border-valid/30 bg-valid-bg text-valid',
    warning: 'border-secondary/40 bg-secondary/10 text-primary',
    info: 'border-primary/15 bg-info-bg text-primary',
  } as const
  const Icon = tone === 'success' ? CheckIcon : InfoIcon
  return (
    <div
      role="status"
      className={`fixed inset-x-3 bottom-24 z-30 flex flex-wrap items-center gap-x-2 gap-y-3 rounded-lg border px-4 py-3 text-sm font-medium shadow-lg sm:static sm:inset-auto sm:bottom-auto sm:z-auto sm:flex-nowrap sm:shadow-none ${styles[tone]}`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1">{children}</span>
      {action && <div className="flex w-full shrink-0 sm:w-auto">{action}</div>}
    </div>
  )
}

/** Light blue explanatory box, used inside the modals. */
export function InfoBox({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg bg-info-bg px-4 py-3 text-sm text-primary">
      <InfoIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary/60" />
      <span>{children}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------

/**
 * Confirmation toast that floats at the top of the viewport and auto-dismisses.
 *
 * Green because every toast this app raises is a success confirmation. The fill
 * is the 100% `valid` token (#059669) rather than the 30% one: the design system
 * scopes the faded green to badges, and this is a solid banner.
 *
 * `message` and `shortMessage` are the same sentence at two lengths: the mobile
 * top bar and a 390px viewport cannot fit the full copy without wrapping.
 */
export function Toast({ message, shortMessage, onDismiss }: { message: string; shortMessage: string; onDismiss: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, 6000)
    return () => window.clearTimeout(timer)
  }, [onDismiss])

  return (
    <div
      role="status"
      className="fixed inset-x-3 top-3 z-50 mx-auto flex max-w-fit items-center gap-2.5 rounded-lg bg-valid px-4 py-3 text-sm font-semibold text-white shadow-lg sm:inset-x-0 sm:top-5 sm:max-w-[calc(100%-2rem)] sm:justify-center"
    >
      <CheckIcon className="h-4 w-4 shrink-0" />
      <span className="sm:hidden">{shortMessage}</span>
      <span className="hidden sm:inline">{message}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Stat cards
// ---------------------------------------------------------------------------

/**
 * One labelled count, e.g. `TOTAL CREW  26`. Used in a responsive row by the
 * pages that summarise a collection (crew counts, roster metrics).
 */
export function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col rounded-xl border border-border-desc/30 bg-card-bg px-4 py-3.5">
      <span className="text-[11px] font-semibold tracking-wider text-primary-text/55 uppercase">{label}</span>
      <span className="mt-1 font-display text-2xl leading-none font-bold text-primary-text">{value}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Pills
// ---------------------------------------------------------------------------

/**
 * Role pill. `Cabin Crew` is outlined in the secondary colour and `Captain` is
 * solid navy; the rest share the neutral treatment so the two that appear most
 * often in a roster stand out.
 */
export function RoleBadge({ role }: { role: string }) {
  const styles = role === 'Captain' ? 'bg-primary text-white' : role === 'Cabin Crew' ? 'text-secondary' : 'bg-page-bg text-primary'
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${
        role === 'Cabin Crew' ? 'border border-secondary/60' : ''
      } ${styles}`}
    >
      {role}
    </span>
  )
}

/** Small uppercase status pill, e.g. `VALID` or `EXPIRING SOON`. */
export function TagPill({ tone, children }: { tone: 'valid' | 'warning' | 'invalid' | 'neutral'; children: ReactNode }) {
  const styles = {
    valid: 'bg-valid-bg text-valid',
    warning: 'bg-secondary/15 text-btn-yellow-hover',
    invalid: 'bg-invalid-bg text-invalid',
    neutral: 'bg-secondary/20 text-btn-yellow-hover',
  } as const
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wide uppercase ${styles[tone]}`}>
      {children}
    </span>
  )
}

/** Square icon-only button used for row actions such as edit. */
export function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="inline-flex items-center justify-center rounded-lg border border-border-desc/40 p-2 text-primary-text/70 transition-colors hover:border-primary/40 hover:bg-page-bg hover:text-primary"
    >
      {children}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Modal overlay
// ---------------------------------------------------------------------------

export function BaseModalOverlay({
  title,
  onClose,
  children,
  footer,
  width = 'max-w-2xl',
}: {
  title: ReactNode
  onClose: () => void
  children: ReactNode
  footer: ReactNode
  width?: string
}) {
  const panelRef = useRef<HTMLDivElement>(null)

  // Escape closes the modal; Tab is trapped inside the panel.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
      if (event.key !== 'Tab' || !panelRef.current) return
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])',
      )
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (!first || !last) return
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div
      className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center bg-primary/40 p-3 backdrop-blur-[2px] sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        className={`flex max-h-[92vh] w-full ${width} flex-col overflow-hidden rounded-2xl bg-card-bg shadow-2xl`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border-desc/40 px-4 py-4 sm:px-6 sm:py-5">
          <h2 className="text-lg font-bold text-primary-text sm:text-xl">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-md p-1 text-border-desc transition-colors hover:bg-page-bg hover:text-primary-text"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">{children}</div>
        <div className="flex justify-end gap-3 border-t border-border-desc/40 bg-page-bg px-4 py-4 sm:px-6">{footer}</div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

type IconProps = { className?: string }

export function ChevronDownIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={className} aria-hidden="true">
      <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function ChevronLeftIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={className} aria-hidden="true">
      <path d="m15 18-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function ArrowLeftIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
      <path d="M19 12H5m6 6-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function ArrowRightIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
      <path d="M5 12h14m-6-6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function CheckIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={className} aria-hidden="true">
      <path d="m5 13 4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function CrossIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={className} aria-hidden="true">
      <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
    </svg>
  )
}

export function CloseIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
      <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
    </svg>
  )
}

export function InfoIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" strokeLinecap="round" />
    </svg>
  )
}

export function PencilIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
      <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function TrashIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
      <path d="M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function SearchIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" strokeLinecap="round" />
    </svg>
  )
}

export function PlusIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={className} aria-hidden="true">
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  )
}

export function ArrowUpIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={className} aria-hidden="true">
      <path d="M12 19V5m-7 7 7-7 7 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function ArrowDownIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={className} aria-hidden="true">
      <path d="M12 5v14m7-7-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function GripIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <circle cx="9" cy="6" r="1.6" />
      <circle cx="15" cy="6" r="1.6" />
      <circle cx="9" cy="12" r="1.6" />
      <circle cx="15" cy="12" r="1.6" />
      <circle cx="9" cy="18" r="1.6" />
      <circle cx="15" cy="18" r="1.6" />
    </svg>
  )
}

export function MoonIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className} aria-hidden="true">
      <path d="M21 13A9 9 0 0 1 11 3a9 9 0 1 0 10 10Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** The unhappy face in the "No pairings yet" empty state. */
export function EmptyFaceIcon({ className = 'h-14 w-14' }: IconProps) {
  return (
    <svg viewBox="0 0 64 64" fill="none" className={className} aria-hidden="true">
      <circle cx="32" cy="32" r="22" stroke="currentColor" strokeWidth="4" />
      <circle cx="25" cy="28" r="2.5" fill="currentColor" />
      <circle cx="39" cy="28" r="2.5" fill="currentColor" />
      <path d="M26 40h12" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  )
}

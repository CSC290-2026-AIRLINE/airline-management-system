import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from 'react'
import { useNavigate, useParams } from '@tanstack/react-router'
import { ArrowLeft, Check, ChevronDown, SquarePen, X } from 'lucide-react'
import { Button } from '@staff-web/components/ui/button'
import { Card } from '@staff-web/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@staff-web/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@staff-web/components/ui/dropdown-menu'
import { Input } from '@staff-web/components/ui/input'
import { Label } from '@staff-web/components/ui/label'
import { Switch } from '@staff-web/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@staff-web/components/ui/table'
import { cn } from '@staff-web/lib/utils'
import { StaffApiError, type StaffCreateBody } from '../api/staff'
import { MIN_REASON_LENGTH, useStaff } from '../hooks/useStaff'
import { NoAccessScreen } from '../components/NoAccessScreen'
import type { RoleSummary, StaffRow } from '../types'

/* Helpers --------------------------------------------------------------- */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** `12 Oct 10:24` in the viewer's local time, as in the design. */
function formatSignIn(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${pad2(d.getDate())} ${MONTHS[d.getMonth()]} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/** `04 Aug 2026`. */
function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${pad2(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

function fullName(s: { first_name: string; last_name: string }): string {
  return `${s.first_name} ${s.last_name}`
}

function looksLikeEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())
}

type StatusFilter = 'active' | 'inactive'

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
]

/** A dialog-level error: title + message + the backend code, shown in the red box above the buttons. */
interface BoxError {
  title: string
  message: string
  code: string
}

const BOX_TITLES: Record<string, string> = {
  NO_CHANGE: 'Nothing changed',
  SELF_ROLE_CHANGE: "You can't change your own role",
  LAST_ADMIN: "Can't remove the last Admin",
  EMAIL_LOCKED: "Work email can't be changed",
  ROLE_NOT_FOUND: 'Role not found',
  STAFF_NOT_FOUND: 'Account not found',
  VALIDATION_FAILED: 'Some fields need fixing',
}

function boxFromError(e: unknown): BoxError {
  if (e instanceof StaffApiError) {
    return { title: BOX_TITLES[e.code] ?? "Couldn't save", message: e.message, code: e.code }
  }
  return { title: "Couldn't save", message: e instanceof Error ? e.message : String(e), code: 'ERROR' }
}

/** The phone breakpoint (≤600px): cards instead of the table, and Create / Edit as a page instead of a pop-up. */
const PHONE_QUERY = '(max-width: 600px)'

function subscribePhone(onChange: () => void) {
  const mq = window.matchMedia(PHONE_QUERY)
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}

function useIsPhone(): boolean {
  return useSyncExternalStore(
    subscribePhone,
    () => window.matchMedia(PHONE_QUERY).matches,
    () => false,
  )
}

/* Shared class lists ------------------------------------------------------ */

/** Inputs and dropdown triggers: 48px on desktop, 40px on a phone. */
const FIELD =
  'h-12 rounded-[9px] border-[#d9dfe9] bg-white px-3.5 text-[15px] text-ink shadow-none placeholder:text-[#8792a6] focus-visible:ring-2 focus-visible:ring-primary/20 aria-invalid:border-danger-line aria-invalid:ring-0 max-phone:h-10 max-phone:rounded-md max-phone:text-[13px] md:text-[15px]'
const BTN = 'h-[46px] rounded-[9px] px-4 text-sm font-semibold shadow-none'
const BTN_GHOST = cn(BTN, 'min-w-[100px] border-input bg-white text-[#131a2b] hover:bg-[#f6f7fa]')
const BTN_PRIMARY = cn(BTN, 'min-w-[130px] bg-[#0e182e] text-white hover:bg-[#1c2a48]')
/** Phone: dialog buttons sit side by side, full width, text on the left. */
const BTN_PHONE =
  'max-phone:h-[38px] max-phone:min-w-0 max-phone:flex-1 max-phone:justify-start max-phone:rounded-md max-phone:px-3 max-phone:text-[13px]'

/* Small pieces used only on this page ------------------------------------ */

interface DropdownOption {
  value: string
  label: string
}

/**
 * The page's one dropdown — the role and status filters, the Role field in the dialogs, and the role picker on the
 * phone cards. A shadcn dropdown menu rather than a `<select>`, so the open list matches the design (check mark,
 * highlighted row).
 */
function Dropdown({
  id,
  value,
  options,
  placeholder,
  onChange,
  deselectable = false,
  invalid = false,
  variant,
  ariaLabel,
}: {
  id?: string
  value: string | null
  options: DropdownOption[]
  placeholder: string
  onChange: (value: string | null) => void
  /** Clicking the selected row again clears the choice (filters only). */
  deselectable?: boolean
  invalid?: boolean
  variant: 'filter' | 'field' | 'card'
  ariaLabel?: string
}) {
  const selected = options.find((o) => o.value === value)

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          id={id}
          aria-label={ariaLabel}
          aria-invalid={invalid || undefined}
          className={cn(
            'flex h-12 w-full items-center gap-1.5 rounded-[9px] border border-input bg-white px-3.5 text-left text-sm font-medium text-[#131a2b] outline-none focus-visible:ring-2 focus-visible:ring-primary/30 max-phone:justify-start',
            variant === 'field' && 'justify-between border-[#d9dfe9] text-[15px] font-semibold text-ink',
            variant === 'field' && !selected && 'font-normal text-muted-foreground',
            variant === 'filter' && 'max-phone:h-10 max-phone:rounded-md max-phone:text-[13px]',
            variant === 'field' && 'max-phone:h-10 max-phone:rounded-md max-phone:text-[13px]',
            variant === 'card' && 'h-[41px] rounded-lg border-[#d3dae6] bg-[#f6f8fc] px-3 text-sm font-semibold text-ink',
            invalid && 'border-danger-line',
          )}
        >
          <span className="truncate">{selected?.label ?? placeholder}</span>
          <ChevronDown className="size-3 shrink-0 text-muted-foreground max-phone:hidden" strokeWidth={2.5} aria-hidden="true" />
          {/* The phone frames draw a small solid caret instead of the desktop chevron. */}
          <span className="hidden text-[13px] leading-none text-ink max-phone:inline" aria-hidden="true">
            ▾
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={6}
        className={cn(
          'flex max-h-[394px] max-w-[540px] min-w-(--radix-dropdown-menu-trigger-width) flex-col gap-0.5 rounded-xl border-[#d9dfe9] p-2 font-sans leading-[normal] shadow-[0_8px_18px_rgba(15,26,46,0.16)]',
          variant === 'filter' && 'phone:min-w-[240px]',
          variant === 'field' && 'max-h-[260px] w-(--radix-dropdown-menu-trigger-width) max-w-none',
          variant === 'card' && 'max-w-[calc(100vw-72px)] min-w-[200px]',
        )}
      >
        {options.map((o) => {
          const isSelected = o.value === value
          return (
            <DropdownMenuItem
              key={o.value}
              role="menuitemradio"
              aria-checked={isSelected}
              className={cn(
                'h-10 gap-2 rounded-lg px-2.5 text-[15px] whitespace-nowrap text-ink focus:bg-[#f4f6fa]',
                isSelected && 'bg-[#eaeff7] focus:bg-[#eaeff7]',
                variant === 'card' && 'h-9 text-[13px]',
              )}
              onSelect={() => onChange(isSelected && deselectable ? null : o.value)}
            >
              <span className="flex w-3.5 shrink-0 justify-center text-primary" aria-hidden="true">
                {isSelected && <Check className="size-3.5 text-primary" strokeWidth={3} />}
              </span>
              {o.label}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function Field({ label, htmlFor, error, children }: { label: ReactNode; htmlFor: string; error?: boolean; children: ReactNode }) {
  return (
    <div className="mb-4 flex flex-col gap-1 max-phone:mb-3 max-phone:gap-1.5">
      <Label
        htmlFor={htmlFor}
        className={cn(
          'mb-0.5 text-[13px] leading-none font-semibold text-muted-foreground max-phone:mb-0 max-phone:text-[10px] max-phone:tracking-[0.3px] max-phone:uppercase',
          error && 'max-phone:text-[#c81e28]',
        )}
      >
        {label}
      </Label>
      {children}
    </div>
  )
}

function Hint({ error, children }: { error?: boolean; children: ReactNode }) {
  return (
    <p className={cn('mt-0.5 text-xs leading-[1.3] text-muted-foreground max-phone:mt-0 max-phone:text-[11px]', error && 'text-[#c81e28]')}>
      {children}
    </p>
  )
}

function ErrorBox({ error }: { error: BoxError }) {
  return (
    <div className="mb-2 flex flex-col gap-1 rounded-lg border border-[#f5c4c4] bg-danger-soft px-3.5 py-3 text-danger" role="alert">
      <strong className="text-[13px] font-bold">{error.title}</strong>
      <span className="text-xs leading-[1.35]">
        {error.message} ({error.code})
      </span>
    </div>
  )
}

/**
 * Centred pop-up (shadcn `Dialog`). Escape and a click outside both cancel, unless `busy` (a request is in flight).
 * Fonts are set again here because the dialog is portalled outside the admin shell.
 */
function Modal({
  title,
  onClose,
  busy = false,
  focusContent = false,
  className,
  children,
}: {
  /** The dialog's accessible name; the visible heading is part of `children`. */
  title: string
  onClose: () => void
  busy?: boolean
  /** Focus the dialog itself on open rather than its first control (the × button on Create / Edit). */
  focusContent?: boolean
  className?: string
  children: ReactNode
}) {
  const contentRef = useRef<HTMLDivElement>(null)
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose()
      }}
    >
      <DialogContent
        ref={contentRef}
        showCloseButton={false}
        onOpenAutoFocus={(e) => {
          if (!focusContent) return
          e.preventDefault()
          contentRef.current?.focus()
        }}
        aria-describedby={undefined}
        className={cn(
          'max-h-[calc(100vh-32px)] gap-0 overflow-y-auto rounded-2xl border-0 bg-white p-0 font-sans leading-[normal] text-ink shadow-[0_16px_40px_rgba(10,20,36,0.2)] sm:max-w-[calc(100%-32px)]',
          className,
        )}
        onInteractOutside={(e) => {
          if (busy) e.preventDefault()
        }}
        onEscapeKeyDown={(e) => {
          if (busy) e.preventDefault()
        }}
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        {children}
      </DialogContent>
    </Dialog>
  )
}

/* Create / Edit dialog --------------------------------------------------- */

function StaffFormDialog({
  row,
  initialRoleId,
  roles,
  nextStaffCode,
  isSelf,
  onCancel,
  onSubmit,
}: {
  /** `null` = Create, otherwise Edit that row. */
  row: StaffRow | null
  /** Pre-selects a role — the phone card's role dropdown opens Edit this way, so the change still needs a reason. */
  initialRoleId?: string
  roles: RoleSummary[]
  nextStaffCode: string
  isSelf: boolean
  onCancel: () => void
  onSubmit: (body: StaffCreateBody) => Promise<void>
}) {
  const isEdit = row !== null
  const isPhone = useIsPhone()
  const uid = useId()
  const [firstName, setFirstName] = useState(row?.first_name ?? '')
  const [lastName, setLastName] = useState(row?.last_name ?? '')
  const [email, setEmail] = useState(row?.email ?? '')
  const [roleId, setRoleId] = useState<string | null>(initialRoleId ?? row?.role.id ?? null)
  const [reason, setReason] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [roleError, setRoleError] = useState<string | null>(null)
  const [reasonError, setReasonError] = useState<string | null>(null)
  const [boxError, setBoxError] = useState<BoxError | null>(null)
  const [saving, setSaving] = useState(false)

  const emailLocked = isEdit && row.claimed
  const reasonMessage = isEdit ? 'A reason is required before saving.' : 'A reason is required before creating this account.'
  const title = isEdit ? 'Edit staff account' : 'Create staff account'

  function clearErrors() {
    setNameError(null)
    setEmailError(null)
    setRoleError(null)
    setReasonError(null)
    setBoxError(null)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (saving) return
    clearErrors()

    /* Same order as the backend, so the first message the admin sees is the one the server would have sent. */
    if (isEdit) {
      const changed =
        firstName.trim() !== row.first_name ||
        lastName.trim() !== row.last_name ||
        email.trim().toLowerCase() !== row.email.toLowerCase() ||
        roleId !== row.role.id
      if (!changed) {
        setBoxError({
          title: BOX_TITLES.NO_CHANGE,
          message: 'No account details changed. Nothing was saved or added to the audit log.',
          code: 'NO_CHANGE',
        })
        return
      }
      if (isSelf && roleId !== row.role.id) {
        setBoxError({
          title: BOX_TITLES.SELF_ROLE_CHANGE,
          message: "You can't change your own role. Ask another Admin to make this change. Nothing was saved.",
          code: 'SELF_ROLE_CHANGE',
        })
        return
      }
    }
    let ok = true
    if (!firstName.trim() || !lastName.trim()) {
      setNameError('Enter both a first name and a last name.')
      ok = false
    }
    if (!looksLikeEmail(email)) {
      setEmailError('Enter a valid work email.')
      ok = false
    }
    if (!roleId) {
      setRoleError('Choose a role.')
      ok = false
    }
    if (reason.trim().length < MIN_REASON_LENGTH) {
      setReasonError(`${reasonMessage} (REASON_REQUIRED)`)
      ok = false
    }
    if (!ok || !roleId) return

    setSaving(true)
    try {
      await onSubmit({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim(),
        role_id: roleId,
        reason: reason.trim(),
      })
    } catch (err: unknown) {
      if (err instanceof StaffApiError && err.code === 'EMAIL_TAKEN') {
        setEmailError(`${err.message} (EMAIL_TAKEN)`)
      } else if (err instanceof StaffApiError && err.code === 'REASON_REQUIRED') {
        setReasonError(`${err.message} (REASON_REQUIRED)`)
      } else {
        setBoxError(boxFromError(err))
      }
      setSaving(false)
    }
  }

  /* Desktop shows the two subtitle lines stacked; the phone page runs them together with " · ". */
  const subtitleParts: string[] = isEdit
    ? [
        `${row.staff_code} · Created ${formatDate(row.created_at)}${!row.claimed ? ' · Not signed in yet' : ''}${!row.claimed && isSelf ? ' · You' : ''}`,
        ...(row.claimed && (row.last_sign_in_at || isSelf)
          ? [
              [row.last_sign_in_at ? `Last sign-in ${formatSignIn(row.last_sign_in_at)}` : '', isSelf ? 'You' : '']
                .filter(Boolean)
                .join(' · '),
            ]
          : []),
      ]
    : ['The account is provisioned first. At the first Clerk sign-in using this email, the staff member claims it.']

  const nameMissing = (v: string) => !!nameError && !v.trim()

  const fields = (
    <>
      <div className="grid grid-cols-2 gap-4 max-phone:grid-cols-1 max-phone:gap-0">
        <Field label="First name" htmlFor={`${uid}-first`} error={nameMissing(firstName)}>
          <Input
            id={`${uid}-first`}
            className={FIELD}
            aria-invalid={nameMissing(firstName) || undefined}
            value={firstName}
            placeholder="e.g. Kamon"
            maxLength={100}
            autoComplete="off"
            onChange={(e) => setFirstName(e.target.value)}
          />
        </Field>
        <Field label="Last name" htmlFor={`${uid}-last`} error={nameMissing(lastName)}>
          <Input
            id={`${uid}-last`}
            className={FIELD}
            aria-invalid={nameMissing(lastName) || undefined}
            value={lastName}
            placeholder="e.g. Wattana"
            maxLength={100}
            autoComplete="off"
            onChange={(e) => setLastName(e.target.value)}
          />
        </Field>
      </div>
      {nameError && (
        <div className="-mt-2.5 mb-4 max-phone:-mt-1.5 max-phone:mb-3">
          <Hint error>{nameError}</Hint>
        </div>
      )}

      <Field label="Work email" htmlFor={`${uid}-email`} error={!!emailError}>
        <Input
          id={`${uid}-email`}
          type="email"
          className={cn(FIELD, 'disabled:opacity-100 disabled:[-webkit-text-fill-color:#6f7c91]')}
          aria-invalid={!!emailError || undefined}
          value={email}
          placeholder="name@flython.example"
          maxLength={254}
          autoComplete="off"
          disabled={emailLocked}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Hint error={!!emailError}>
          {emailError ??
            (!isEdit
              ? 'Must not be used by another staff account.'
              : emailLocked
                ? 'Claimed after first Clerk sign-in — work email can no longer be changed.'
                : `Not claimed yet — you can still fix the email until ${row.first_name} signs in for the first time.`)}
        </Hint>
      </Field>

      {isEdit && (
        <Field label="Staff ID" htmlFor={`${uid}-code`}>
          <Input
            id={`${uid}-code`}
            className={cn(FIELD, 'bg-[#f2f4f8] text-muted-foreground disabled:opacity-100')}
            value={row.staff_code}
            disabled
          />
          <Hint>Made by the system. Can&apos;t be edited.</Hint>
        </Field>
      )}

      <Field label="Role" htmlFor={`${uid}-role`} error={!!roleError}>
        <Dropdown
          id={`${uid}-role`}
          variant="field"
          value={roleId}
          options={roles.map((r) => ({ value: r.id, label: r.name }))}
          placeholder="Choose a role"
          invalid={roleError !== null}
          onChange={(v) => setRoleId(v)}
        />
        <Hint error={!!roleError}>
          {roleError ??
            (isEdit
              ? 'Changes the screens this person sees on their next page load.'
              : 'The role decides which screens this person can open.')}
        </Hint>
      </Field>

      {!isEdit && (
        <p className="mb-4 flex min-h-[46px] items-center gap-1 rounded-[9px] bg-[#fff4de] px-4 text-sm text-warning max-phone:mb-3 max-phone:min-h-9 max-phone:rounded-md max-phone:px-3 max-phone:text-xs">
          Staff ID will be <strong className="font-extrabold">{nextStaffCode || 'assigned on create'}.</strong>
        </p>
      )}

      <Field label="Reason (saved in the audit log)" htmlFor={`${uid}-reason`} error={!!reasonError}>
        <Input
          id={`${uid}-reason`}
          className={FIELD}
          aria-invalid={!!reasonError || undefined}
          value={reason}
          placeholder={isEdit ? 'Why is this changing?' : 'Why is this account being created?'}
          maxLength={500}
          autoComplete="off"
          onChange={(e) => setReason(e.target.value)}
        />
        {reasonError && <Hint error>{reasonError}</Hint>}
      </Field>

      {boxError && <ErrorBox error={boxError} />}
    </>
  )

  const actions = (
    <footer className="flex justify-end gap-2.5 px-[30px] pt-4 pb-[30px] max-phone:gap-2 max-phone:px-0 max-phone:pt-1 max-phone:pb-0">
      <Button type="button" variant="outline" className={cn(BTN_GHOST, BTN_PHONE)} onClick={onCancel} disabled={saving}>
        Cancel
      </Button>
      <Button type="submit" className={cn(BTN_PRIMARY, BTN_PHONE)} disabled={saving}>
        {saving ? (isEdit ? 'Saving…' : 'Creating…') : isEdit ? 'Save changes' : 'Create account'}
      </Button>
    </footer>
  )

  /* Phone: the design shows Create / Edit as a page in the content area ("← Back", then the form in a card) rather
     than a pop-up, so it renders in the page flow and the list behind it is hidden (see `data-staff-sheet`). */
  if (isPhone) {
    return (
      <form
        onSubmit={submit}
        noValidate
        data-staff-sheet=""
        aria-labelledby={`${uid}-title`}
        className="font-sans leading-[normal] text-ink"
      >
        <button
          type="button"
          className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-[#2563eb] disabled:opacity-60"
          onClick={onCancel}
          disabled={saving}
        >
          <ArrowLeft className="size-3" strokeWidth={2.5} aria-hidden="true" />
          Back
        </button>
        <header className="flex flex-wrap items-center gap-x-4 pb-1">
          <h2 id={`${uid}-title`} className="m-0 flex-auto font-sans text-lg leading-none font-bold tracking-[-0.01em] text-ink">
            {title}
          </h2>
          <Button
            type="button"
            variant="outline"
            className="h-7 w-9 rounded-md border-[#d9dfe9] p-0 shadow-none"
            onClick={onCancel}
            disabled={saving}
            aria-label="Close"
          >
            <X className="size-3.5" />
          </Button>
          <p className="mt-1.5 basis-full text-xs leading-[1.35] text-muted-foreground">{subtitleParts.join(' · ')}</p>
        </header>
        <Card className="mt-2.5 gap-0 rounded-[10px] border-[#d9dfe9] p-3 shadow-none">
          {fields}
          {actions}
        </Card>
      </form>
    )
  }

  return (
    <Modal
      title={title}
      onClose={onCancel}
      busy={saving}
      focusContent
      className="w-[600px] border border-[#d6dbe6] shadow-[0_12px_32px_rgba(10,20,36,0.18)]"
    >
      <form onSubmit={submit} noValidate>
        <header className="flex items-start justify-between gap-4 border-b border-[#e6e9f0] px-[30px] pt-[30px] pb-[22px]">
          <div>
            <h2 aria-hidden="true" className="m-0 font-sans text-[28px] leading-none font-bold tracking-[-0.05em] text-ink">
              {title}
            </h2>
            <DialogDescription asChild>
              <div className="mt-2 text-sm leading-[1.35] text-muted-foreground">
                {subtitleParts.map((p) => (
                  <span key={p} className="block">
                    {p}
                  </span>
                ))}
              </div>
            </DialogDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            className="size-9 shrink-0 rounded-lg border-[#d9dfe9] p-0 text-ink shadow-none"
            onClick={onCancel}
            disabled={saving}
            aria-label="Close"
          >
            <X className="size-4" />
          </Button>
        </header>
        <div className="px-[30px] pt-6">{fields}</div>
        {actions}
      </form>
    </Modal>
  )
}

/* Activate / Deactivate dialog -------------------------------------------- */

function StatusDialog({
  row,
  onCancel,
  onSubmit,
}: {
  row: StaffRow
  onCancel: () => void
  /** Resolves on success; rejects with the API error, which this dialog shows unless the page takes it over. */
  onSubmit: (reason: string) => Promise<void>
}) {
  const uid = useId()
  const deactivating = row.active
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState<string | null>(null)
  const [boxError, setBoxError] = useState<BoxError | null>(null)
  const [saving, setSaving] = useState(false)
  const verb = deactivating ? 'Deactivate' : 'Activate'

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (saving) return
    setReasonError(null)
    setBoxError(null)
    if (reason.trim().length < MIN_REASON_LENGTH) {
      setReasonError(`A reason is required before ${deactivating ? 'deactivating' : 'activating'} this account. (REASON_REQUIRED)`)
      return
    }
    setSaving(true)
    try {
      await onSubmit(reason.trim())
    } catch (err: unknown) {
      if (err instanceof StaffApiError && err.code === 'REASON_REQUIRED') setReasonError(`${err.message} (REASON_REQUIRED)`)
      else setBoxError(boxFromError(err))
      setSaving(false)
    }
  }

  return (
    <Modal
      title={`${verb} ${fullName(row)}?`}
      onClose={onCancel}
      busy={saving}
      className="w-[480px] p-8 max-phone:max-w-[360px] max-phone:rounded-[10px] max-phone:p-4"
    >
      <form onSubmit={submit} noValidate>
        <h2
          aria-hidden="true"
          className="m-0 font-sans text-2xl leading-[1.2] font-semibold text-[#131a2b] max-phone:text-[17px] max-phone:font-bold"
        >
          {verb} {fullName(row)}?
        </h2>
        <p className="mt-2.5 mb-4 text-sm leading-[1.35] text-[#6e7a94] max-phone:mt-2 max-phone:mb-2.5 max-phone:text-xs">
          {deactivating
            ? `${row.first_name} won’t be able to sign in and will be signed out within 15 minutes. An Admin can turn the account back on.`
            : `${row.first_name} will be able to sign in again.`}
        </p>
        <p className="mb-[22px] flex min-h-12 items-center rounded-[10px] bg-warning-soft px-4 text-sm font-medium text-[#b27314] max-phone:mb-3 max-phone:min-h-[34px] max-phone:rounded-md max-phone:px-2.5 max-phone:text-[11px]">
          This action is saved in the audit log.
        </p>
        <Field
          htmlFor={`${uid}-reason`}
          error={!!reasonError}
          label={
            <span className="text-[#6e7a94]">
              Reason<span className="text-danger-line">*</span>
              <span className="max-phone:hidden"> (saved in the audit log)</span>
            </span>
          }
        >
          <Input
            id={`${uid}-reason`}
            className={cn(FIELD, 'h-11 border-input')}
            aria-invalid={!!reasonError || undefined}
            value={reason}
            placeholder={`Why is this account being ${deactivating ? 'deactivated' : 'activated'}?`}
            maxLength={500}
            autoComplete="off"
            autoFocus
            onChange={(e) => setReason(e.target.value)}
          />
          {reasonError && <Hint error>{reasonError}</Hint>}
        </Field>
        {boxError && <ErrorBox error={boxError} />}
        <footer className="flex justify-end gap-2.5 pt-1 max-phone:gap-2">
          <Button
            type="button"
            variant="outline"
            className={cn(BTN_GHOST, 'min-w-[104px]', BTN_PHONE)}
            onClick={onCancel}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            className={cn(BTN_PRIMARY, 'min-w-[120px]', BTN_PHONE, deactivating && 'max-phone:bg-[#c8202d] max-phone:hover:bg-[#a81a25]')}
            disabled={saving}
          >
            {saving ? `${verb === 'Deactivate' ? 'Deactivating' : 'Activating'}…` : verb}
          </Button>
        </footer>
      </form>
    </Modal>
  )
}

/* "You can't" dialog (SELF_DISABLE, LAST_ADMIN) --------------------------- */

interface BlockedInfo {
  title: string
  message: string
  code: string
}

function BlockedDialog({ info, onClose }: { info: BlockedInfo; onClose: () => void }) {
  return (
    <Modal
      title={info.title}
      onClose={onClose}
      className="flex w-[480px] flex-col gap-3.5 p-7 max-phone:max-w-[360px] max-phone:gap-2.5 max-phone:rounded-[10px] max-phone:p-4"
    >
      <h2 aria-hidden="true" className="m-0 font-sans text-2xl leading-[1.2] font-bold text-ink max-phone:text-[17px]">
        {info.title}
      </h2>
      <p className="text-sm leading-[1.35] text-[#677287] max-phone:text-xs">{info.message}</p>
      <p className="rounded-lg bg-danger-soft px-3.5 py-2.5 text-xs leading-none font-semibold text-danger max-phone:bg-warning-soft max-phone:text-[11px] max-phone:text-warning">
        <span className="max-phone:hidden">Error </span>
        {info.code} · nothing was changed
      </p>
      <div className="flex justify-end">
        <Button
          type="button"
          className={cn(BTN_PRIMARY, 'h-10 min-w-0 px-[18px] max-phone:h-[38px] max-phone:flex-1 max-phone:justify-start')}
          onClick={onClose}
          autoFocus
        >
          <span className="max-phone:hidden">Okay</span>
          <span className="hidden max-phone:inline">Got it</span>
        </Button>
      </div>
    </Modal>
  )
}

/* Page ------------------------------------------------------------------ */

/** Edit is not in here: it is driven by the URL (`/admin/staff/$staffId`) so it can be linked to and closed with Back. */
type Dialog = { kind: 'create' } | { kind: 'status'; id: string } | { kind: 'blocked'; info: BlockedInfo }

/**
 * Green (or red) banner above the filters after a save. `desktop` replaces title + body on wide screens where the
 * desktop design has its own one-line wording (the create banner); the phone design always uses title + body.
 */
interface Notice {
  tone: 'success' | 'error'
  title?: string
  body: string
  desktop?: string
}

const FILTER_LABEL = 'hidden text-[10px] leading-none font-semibold tracking-[0.3px] text-muted-foreground uppercase max-phone:block'

/**
 * Staff & roles tab: summary cards, search + role/status filters, the staff table, and the Create / Edit / Activate /
 * Deactivate dialogs. Layout, copy and states follow the F15 design and its detail notes.
 *
 * Access gates live one level up in `routes/_authenticated/admin/route.tsx`, like the other two tabs.
 *
 * `/admin/staff/$staffId` (the spec's deep link) opens Edit for that account on top of this page; an id that does not
 * exist falls back to the list with a STAFF_NOT_FOUND banner.
 */
export function StaffRolesPage() {
  const staff = useStaff()
  const navigate = useNavigate()
  const isPhone = useIsPhone()
  const { staffId } = useParams({ strict: false })
  /** Role picked in a phone card's dropdown; pre-selected when Edit opens for that account. */
  const [editRoleHint, setEditRoleHint] = useState<{ id: string; roleId: string } | null>(null)

  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter | null>(null)
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const noticeRef = useRef<HTMLDivElement>(null)

  /* On a phone the save often happens far down the list (or on the Create / Edit page), so bring the result into view. */
  useEffect(() => {
    if (notice) noticeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [notice])

  const stats = useMemo(() => {
    const active = staff.staff.filter((s) => s.active).length
    return {
      total: staff.staff.length,
      active,
      inactive: staff.staff.length - active,
      // Distinct roles that at least one account holds.
      assignedRoles: new Set(staff.staff.map((s) => s.role.id)).size,
    }
  }, [staff.staff])

  const filtering = query.trim() !== '' || roleFilter !== null || statusFilter !== null
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return staff.staff.filter((s) => {
      if (roleFilter && s.role.id !== roleFilter) return false
      if (statusFilter && s.active !== (statusFilter === 'active')) return false
      if (!q) return true
      return fullName(s).toLowerCase().includes(q) || s.email.toLowerCase().includes(q) || s.staff_code.toLowerCase().includes(q)
    })
  }, [staff.staff, query, roleFilter, statusFilter])

  const roleOptions = useMemo(() => staff.roles.map((r) => ({ value: r.id, label: r.name })), [staff.roles])

  /* A link to an account that is not in the list (old link, mistyped id, or removed). The banner is set while
     rendering — React's pattern for state that follows a changed value — and the URL goes back to the list. */
  const missingId = staffId && !staff.loading && !staff.error && !staff.staff.some((s) => s.id === staffId) ? staffId : null
  const [reportedMissingId, setReportedMissingId] = useState<string | null>(null)
  if (missingId && missingId !== reportedMissingId) {
    setReportedMissingId(missingId)
    setNotice({
      tone: 'error',
      title: 'Staff member not found (STAFF_NOT_FOUND)',
      body: 'The link may be old, or the account ID is wrong. Showing all staff instead.',
    })
  }
  useEffect(() => {
    if (missingId) void navigate({ to: '/admin/staff', search: true, replace: true })
  }, [missingId, navigate])

  function openEdit(id: string, roleId?: string) {
    setNotice(null)
    setEditRoleHint(roleId ? { id, roleId } : null)
    void navigate({ to: '/admin/staff/$staffId', params: { staffId: id }, search: true })
  }

  function closeEdit() {
    setEditRoleHint(null)
    void navigate({ to: '/admin/staff', search: true })
  }

  function clearFilters() {
    setQuery('')
    setRoleFilter(null)
    setStatusFilter(null)
  }

  function openDialog(d: Dialog) {
    setNotice(null)
    setDialog(d)
  }

  function onToggle(row: StaffRow) {
    if (row.active && row.id === staff.viewerStaffId) {
      openDialog({
        kind: 'blocked',
        info: {
          title: 'You can’t deactivate your own account',
          message: 'Ask another Admin to do it. This stops an Admin locking themselves out.',
          code: 'SELF_DISABLE',
        },
      })
      return
    }
    openDialog({ kind: 'status', id: row.id })
  }

  /* Render ------------------------------------------------------------ */

  if (staff.loading) return <p className="text-sm text-muted-foreground">Loading staff accounts…</p>
  if (staff.error) {
    if (staff.error.status === 403) return <NoAccessScreen screenName="Staff & roles" homeTo="/" />
    return (
      <Card className="gap-0 rounded-[14px] border-[#d9dfe9] px-7 py-6 font-sans leading-[normal] shadow-none" role="alert">
        <h2 className="m-0 mb-2 font-sans text-lg font-bold text-ink">
          Staff &amp; roles failed to load{staff.error.status ? ` — HTTP ${staff.error.status}` : ''}
        </h2>
        <p className="mb-4 text-sm break-words text-muted-foreground">{staff.error.message}</p>
        <div>
          <Button type="button" className={BTN_PRIMARY} onClick={() => window.location.reload()}>
            Retry
          </Button>
        </div>
      </Card>
    )
  }

  const editRow = staffId ? (staff.staff.find((s) => s.id === staffId) ?? null) : null
  const editRoleId = editRow && editRoleHint?.id === editRow.id ? editRoleHint.roleId : undefined
  const statusRow = dialog?.kind === 'status' ? (staff.staff.find((s) => s.id === dialog.id) ?? null) : null
  /* On a phone Create / Edit replaces the list instead of floating over it. */
  const sheetOpen = isPhone && (dialog?.kind === 'create' || editRow !== null)

  const emptyText = filtering ? 'No staff accounts match these filters.' : 'No staff accounts yet.'

  return (
    <>
      {!sheetOpen && (
        <div className="flex flex-col gap-4 font-sans leading-[normal] text-ink max-phone:gap-3">
          <div className="grid grid-cols-4 gap-[18px] max-wide:grid-cols-2 max-phone:hidden">
            {[
              { label: 'Total staff', value: stats.total },
              { label: 'Active accounts', value: stats.active },
              { label: 'Inactive accounts', value: stats.inactive },
              { label: 'Assigned roles', value: stats.assignedRoles },
            ].map((c) => (
              <Card key={c.label} className="h-20 justify-between gap-1 rounded-xl border-[#cbd5e1] p-4 shadow-none">
                <span className="text-[11px] leading-none font-semibold tracking-[0.6px] text-[#677287] uppercase">{c.label}</span>
                <span className="text-2xl leading-none font-extrabold text-primary">{c.value}</span>
              </Card>
            ))}
          </div>

          {notice && (
            <div
              ref={noticeRef}
              className={cn(
                'flex min-h-11 scroll-mt-20 items-center rounded-[9px] bg-success-soft px-[22px] py-3 text-sm leading-[1.3] text-success max-phone:min-h-0 max-phone:rounded-lg max-phone:px-3 max-phone:py-2.5',
                notice.tone === 'error' && 'bg-danger-soft text-danger',
              )}
              role={notice.tone === 'error' ? 'alert' : 'status'}
            >
              {notice.desktop && <span className="max-phone:hidden">{notice.desktop}</span>}
              <span
                className={cn(
                  'inline-flex flex-wrap gap-x-1.5 max-phone:flex-col max-phone:gap-y-1',
                  notice.desktop && 'hidden max-phone:inline-flex',
                )}
              >
                {notice.title && (
                  <strong
                    className={cn(
                      'font-semibold max-phone:text-[13px]',
                      notice.tone === 'error' ? 'text-danger' : 'max-phone:text-success-strong',
                    )}
                  >
                    {notice.title}
                  </strong>
                )}
                <span className="max-phone:text-xs max-phone:leading-[1.35]">{notice.body}</span>
              </span>
            </div>
          )}

          {/* One row on desktop; on a phone the same controls stack into a card with small labels, as in the design. */}
          <div className="flex flex-wrap items-center gap-3 max-phone:grid max-phone:grid-cols-2 max-phone:gap-x-2 max-phone:gap-y-2.5 max-phone:rounded-[10px] max-phone:border max-phone:border-[#d9dfe9] max-phone:bg-white max-phone:p-3">
            <label className="min-w-[200px] flex-[0_1_313px] max-phone:col-span-2 max-phone:flex max-phone:min-w-0 max-phone:flex-col max-phone:gap-1.5">
              <span className={FILTER_LABEL}>Search staff</span>
              <Input
                className="h-12 rounded-[9px] border-input bg-white px-3.5 text-sm font-medium text-[#131a2b] shadow-none placeholder:text-[#131a2b]/80 max-phone:h-10 max-phone:rounded-md max-phone:text-[13px] md:text-sm"
                type="search"
                value={query}
                placeholder="Search staff…"
                aria-label="Search staff by name, email or staff ID"
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <div className="min-w-0 flex-[0_0_190px] max-phone:flex max-phone:flex-col max-phone:gap-1.5">
              <span className={FILTER_LABEL} aria-hidden="true">
                Role
              </span>
              <Dropdown
                variant="filter"
                value={roleFilter}
                options={roleOptions}
                placeholder="All roles"
                ariaLabel="Filter by role"
                deselectable
                onChange={setRoleFilter}
              />
            </div>
            <div className="min-w-0 flex-[0_0_190px] max-phone:flex max-phone:flex-col max-phone:gap-1.5">
              <span className={FILTER_LABEL} aria-hidden="true">
                Status
              </span>
              <Dropdown
                variant="filter"
                value={statusFilter}
                options={STATUS_OPTIONS}
                placeholder="Any status"
                ariaLabel="Filter by status"
                deselectable
                onChange={(v) => setStatusFilter(v as StatusFilter | null)}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              className={cn(
                BTN_GHOST,
                'w-[92px] min-w-[92px] max-phone:col-span-2 max-phone:h-[38px] max-phone:w-auto max-phone:rounded-md max-phone:text-[13px]',
              )}
              onClick={clearFilters}
            >
              <span>
                Clear<span className="hidden max-phone:inline"> filters</span>
              </span>
            </Button>
            <Button
              type="button"
              className={cn(
                BTN_PRIMARY,
                'ml-auto h-[42px] w-[172px] bg-primary max-wide:ml-0 max-phone:col-span-2 max-phone:h-[38px] max-phone:w-auto max-phone:rounded-md max-phone:text-[13px]',
              )}
              onClick={() => openDialog({ kind: 'create' })}
            >
              Create staff account
            </Button>
          </div>

          <Card
            className="gap-0 rounded-[14px] border-[#d9dfe9] px-3 pt-[22px] pb-1.5 shadow-none max-phone:rounded-xl max-phone:p-3.5"
            aria-labelledby="sr-table-title"
            role="region"
          >
            <header className="flex items-baseline justify-between gap-4 px-2 pb-[22px] max-phone:items-center max-phone:px-0 max-phone:pb-3">
              <h2 id="sr-table-title" className="m-0 font-sans text-lg leading-none font-bold text-ink">
                Staff accounts
              </h2>
              <span className="text-right text-[13px] leading-none text-muted-foreground max-phone:text-xs max-phone:font-semibold">
                {filtering ? (
                  <>
                    <span className="max-phone:hidden">{`${rows.length} matching staff account${rows.length === 1 ? '' : 's'}`}</span>
                    <span className="hidden max-phone:inline">{`${rows.length} result${rows.length === 1 ? '' : 's'}`}</span>
                  </>
                ) : (
                  `${stats.active} active of ${stats.total}`
                )}
              </span>
            </header>

            {isPhone ? (
              /* Phone layout: one card per account instead of the table. Tapping the status pill opens the same
                 Activate / Deactivate dialog as the desktop switch; picking a role opens Edit with that role chosen,
                 because a role change always needs a reason. */
              <ul className="flex flex-col gap-[11px]">
                {rows.map((s) => (
                  <li key={s.id} className="flex flex-col rounded-xl border border-[#d9dfe9] bg-white p-3.5">
                    <div className="flex min-h-[31px] items-start justify-between gap-2">
                      <p className="mt-0.5 text-[15px] leading-tight font-bold text-ink">
                        {fullName(s)}
                        {s.id === staff.viewerStaffId && ' · You'}
                      </p>
                      <button
                        type="button"
                        className={cn(
                          'h-[31px] min-w-[84px] shrink-0 rounded-[9px] bg-[#e3e8f1] px-3 text-[11px] leading-none font-semibold text-[#8792a6]',
                          s.active && 'bg-[#dcf7e3] text-success-strong',
                        )}
                        aria-label={`${s.active ? 'Active' : 'Inactive'} — ${s.active ? 'deactivate' : 'activate'} ${fullName(s)}`}
                        onClick={() => onToggle(s)}
                      >
                        {s.active ? 'Active' : 'Inactive'}
                      </button>
                    </div>
                    <p className="mt-2.5 text-xs leading-[1.3] [overflow-wrap:anywhere] text-muted-foreground">
                      {s.email} · {s.staff_code}
                    </p>
                    <div className="mt-[17px] grid grid-cols-[minmax(0,1fr)_86px] gap-2.5">
                      <Dropdown
                        variant="card"
                        value={s.role.id}
                        options={roleOptions}
                        placeholder={s.role.name}
                        ariaLabel={`Role for ${fullName(s)}`}
                        onChange={(v) => {
                          if (v && v !== s.role.id) openEdit(s.id, v)
                        }}
                      />
                      <div className="flex h-[41px] flex-col justify-between py-0.5 text-[13px] whitespace-nowrap text-muted-foreground">
                        <span className="text-[10px] font-semibold tracking-[0.3px] uppercase">Last sign-in</span>
                        <span>{formatSignIn(s.last_sign_in_at)}</span>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="mt-[13px] h-[39px] gap-2 rounded-lg border-[#d3dae6] text-[15px] font-semibold text-ink shadow-none"
                      onClick={() => openEdit(s.id)}
                    >
                      <SquarePen className="size-4" aria-hidden="true" />
                      Edit
                    </Button>
                  </li>
                ))}
                {rows.length === 0 && (
                  <li className="rounded-xl border border-[#d9dfe9] bg-white p-3.5 text-center text-[13px] text-muted-foreground">
                    {emptyText}
                  </li>
                )}
              </ul>
            ) : (
              <Table className="table-fixed">
                <colgroup>
                  <col />
                  <col />
                  <col className="w-[92px]" />
                  <col />
                  <col className="w-[124px]" />
                  <col className="w-[112px]" />
                  <col className="w-12" />
                </colgroup>
                <TableHeader>
                  <TableRow className="border-[#d9dfe9] hover:bg-transparent">
                    {['Name', 'Email', 'Staff ID', 'Role', 'Status', 'Last sign-in'].map((h) => (
                      <TableHead
                        key={h}
                        className="h-auto px-2 pt-0 pb-2 text-[11px] leading-none font-semibold text-muted-foreground uppercase"
                      >
                        {h}
                      </TableHead>
                    ))}
                    <TableHead className="h-auto px-2 pt-0 pb-2">
                      <span className="sr-only">Edit</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="[&_td]:h-[50px] [&_td]:truncate [&_td]:px-2 [&_td]:py-0 [&_td]:text-[13px] [&_td]:leading-none [&_tr]:border-[#d9dfe9] [&_tr]:hover:bg-transparent">
                  {rows.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="text-sm! font-semibold text-ink">
                        {fullName(s)}
                        {s.id === staff.viewerStaffId && (
                          <span className="ml-2 inline-block rounded-full bg-primary px-2 py-[3px] align-[1px] text-[11px] leading-none font-semibold text-white">
                            You
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{s.email}</TableCell>
                      <TableCell className="text-ink">{s.staff_code}</TableCell>
                      <TableCell className="font-semibold text-ink">{s.role.name}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-2">
                          <Switch
                            checked={s.active}
                            aria-label={`${s.active ? 'Deactivate' : 'Activate'} ${fullName(s)}`}
                            onCheckedChange={() => onToggle(s)}
                            className="border-0 px-0.5 data-[size=default]:h-[22px] data-[size=default]:w-[42px] shadow-none data-[state=checked]:bg-success data-[state=unchecked]:bg-[#c5cdd9] [&>span]:size-[18px]! [&>span]:shadow-[0_1px_2px_rgba(10,20,36,0.25)] [&>span[data-state=checked]]:translate-x-5"
                          />
                          <span className={cn('text-[13px] font-medium text-muted-foreground', s.active && 'text-success')}>
                            {s.active ? 'Active' : 'Inactive'}
                          </span>
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{formatSignIn(s.last_sign_in_at)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="size-8 rounded-lg border-[#cbd5e1] text-primary shadow-none hover:bg-[#f4f6fa]"
                          aria-label={`Edit ${fullName(s)}`}
                          title="Edit"
                          onClick={() => openEdit(s.id)}
                        >
                          <SquarePen className="size-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="h-24! text-center text-muted-foreground">
                        {emptyText}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </Card>
        </div>
      )}

      {dialog?.kind === 'create' && (
        <StaffFormDialog
          row={null}
          roles={staff.roles}
          nextStaffCode={staff.nextStaffCode}
          isSelf={false}
          onCancel={() => setDialog(null)}
          onSubmit={async (body) => {
            const row = await staff.create(body)
            setDialog(null)
            setNotice({
              tone: 'success',
              title: 'Account created · waiting for first sign-in',
              body: 'It’s claimed the first time this person signs in with the work email an Admin set up.',
              desktop: `Account created for ${fullName(row)} (${row.staff_code}). Waiting for first sign-in; it's claimed the first time ${row.email} signs in.`,
            })
          }}
        />
      )}

      {editRow && (
        <StaffFormDialog
          key={`${editRow.id}:${editRoleId ?? ''}`}
          row={editRow}
          initialRoleId={editRoleId}
          roles={staff.roles}
          nextStaffCode={staff.nextStaffCode}
          isSelf={editRow.id === staff.viewerStaffId}
          onCancel={closeEdit}
          onSubmit={async (body) => {
            await staff.update(editRow.id, body)
            closeEdit()
            setNotice(
              body.role_id !== editRow.role.id
                ? { tone: 'success', title: 'Role updated', body: 'New screen access applies on the next page load.' }
                : { tone: 'success', title: 'Account updated', body: 'The changes are saved in the audit log.' },
            )
          }}
        />
      )}

      {statusRow && (
        <StatusDialog
          key={statusRow.id}
          row={statusRow}
          onCancel={() => setDialog(null)}
          onSubmit={async (reason) => {
            try {
              await staff.setStatus(statusRow.id, { active: !statusRow.active, reason })
              setDialog(null)
              setNotice({
                tone: 'success',
                body: statusRow.active
                  ? `${fullName(statusRow)} is now inactive. They can’t sign in and will be signed out within 15 minutes.`
                  : `${fullName(statusRow)} is now active. They can sign in again.`,
              })
            } catch (err: unknown) {
              /* SELF_DISABLE / LAST_ADMIN get their own "nothing was changed" dialog, as in the design. */
              if (err instanceof StaffApiError && (err.code === 'LAST_ADMIN' || err.code === 'SELF_DISABLE')) {
                setDialog({
                  kind: 'blocked',
                  info:
                    err.code === 'LAST_ADMIN'
                      ? {
                          title: 'Can’t deactivate the last Admin',
                          message: `Another Admin change was saved at the same moment, so deactivating ${statusRow.first_name} now would leave no active Admin.`,
                          code: 'LAST_ADMIN',
                        }
                      : {
                          title: 'You can’t deactivate your own account',
                          message: 'Ask another Admin to do it. This stops an Admin locking themselves out.',
                          code: 'SELF_DISABLE',
                        },
                })
                return
              }
              throw err
            }
          }}
        />
      )}

      {dialog?.kind === 'blocked' && <BlockedDialog info={dialog.info} onClose={() => setDialog(null)} />}
    </>
  )
}

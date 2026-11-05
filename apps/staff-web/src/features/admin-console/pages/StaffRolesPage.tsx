import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from 'react'
import { useNavigate, useParams } from '@tanstack/react-router'
import { ArrowLeft, CircleAlert, CircleCheck, Plus, SquarePen, Users, X } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@staff-web/components/ui/alert'
import { Badge } from '@staff-web/components/ui/badge'
import { Button } from '@staff-web/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@staff-web/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@staff-web/components/ui/dialog'
import { Input } from '@staff-web/components/ui/input'
import { Label } from '@staff-web/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@staff-web/components/ui/select'
import { Skeleton } from '@staff-web/components/ui/skeleton'
import { Switch } from '@staff-web/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@staff-web/components/ui/table'
import { cn } from '@staff-web/lib/utils'
import editIcon from '../assets/icon-edit.svg'
import { StaffApiError, type StaffCreateBody } from '../api/staff'
import { MIN_REASON_LENGTH, useStaff } from '../hooks/useStaff'
import { NoAccessScreen } from '../components/NoAccessScreen'
import type { RoleSummary, StaffRow } from '../types'

/* Helpers --------------------------------------------------------------- */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** `10:24 AM` / `2:05 PM` — 12-hour clock. */
function clock12(d: Date): string {
  const h = d.getHours()
  return `${h % 12 || 12}:${pad2(d.getMinutes())} ${h < 12 ? 'AM' : 'PM'}`
}

/** `12 Oct 10:24 AM` in the viewer's local time. */
function formatSignIn(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${pad2(d.getDate())} ${MONTHS[d.getMonth()]} ${clock12(d)}`
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
/** Phone: dialog buttons sit side by side, full width, text on the left. */
const BTN_PHONE = 'max-phone:min-w-0 max-phone:flex-1 max-phone:justify-start max-phone:px-3'

/* Small pieces used only on this page ------------------------------------ */

interface DropdownOption {
  value: string
  label: string
}

/** Radix Select forbids an empty item value, so the "clear this filter" row uses this stand-in. */
const CLEAR = '__clear__'

/**
 * The page's one dropdown — the role and status filters, the Role field in the dialogs, and the role picker on the
 * phone cards. A shadcn `Select`. A `deselectable` one (the filters) gets a leading row that clears the choice.
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
  /** Adds a first row, labelled with the placeholder, that clears the choice (filters only). */
  deselectable?: boolean
  invalid?: boolean
  variant: 'filter' | 'field' | 'card'
  ariaLabel?: string
}) {
  const items = deselectable ? [{ value: CLEAR, label: placeholder }, ...options.filter((o) => o.value !== '')] : options
  const selected = options.find((o) => o.value === value)

  return (
    <Select value={value ?? (deselectable ? CLEAR : '')} onValueChange={(v) => onChange(v === CLEAR ? null : v)}>
      <SelectTrigger
        id={id}
        // The visible value is part of the name (WCAG 2.5.3 "label in name"), e.g. "Filter by role: All roles".
        aria-label={ariaLabel ? `${ariaLabel}: ${selected?.label ?? placeholder}` : undefined}
        aria-invalid={invalid || undefined}
        className={cn(
          'w-full gap-1.5 border-input bg-background px-3.5 text-left text-sm font-medium text-foreground focus-visible:ring-2 focus-visible:ring-primary/30',
          variant === 'filter' && 'rounded-[9px] data-[size=default]:h-12 max-phone:data-[size=default]:h-10',
          variant === 'field' && 'border-border text-foreground',
          variant === 'card' && 'border-input bg-accent px-3 text-sm text-foreground max-phone:text-sm',
          invalid && 'border-danger-line',
        )}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent
        position="popper"
        align="start"
        sideOffset={6}
        className={cn('max-h-98.5 max-w-135 border-border font-sans', variant === 'field' && 'max-h-65')}
      >
        {items.map((o) => (
          <SelectItem key={o.value} value={o.value} className={cn('px-2.5 whitespace-nowrap text-foreground', variant === 'card' && '')}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function Field({ label, htmlFor, error, children }: { label: ReactNode; htmlFor: string; error?: boolean; children: ReactNode }) {
  return (
    <div className="mb-4 flex flex-col gap-1 max-phone:mb-3 max-phone:gap-1.5">
      <Label
        htmlFor={htmlFor}
        className={cn('mb-0.5 text-muted-foreground max-phone:mb-0 max-phone:uppercase', error && 'max-phone:text-danger')}
      >
        {label}
      </Label>
      {children}
    </div>
  )
}

function Hint({ error, children }: { error?: boolean; children: ReactNode }) {
  return (
    <p className={cn('mt-0.5 text-xs leading-tight text-muted-foreground max-phone:mt-0 max-phone:text-xs', error && 'text-danger')}>
      {children}
    </p>
  )
}

function ErrorBox({ error }: { error: BoxError }) {
  return (
    <div className="mb-2 flex flex-col gap-1 rounded-lg border border-danger-line bg-danger-soft px-3.5 py-3 text-danger" role="alert">
      <strong className="text-sm font-bold">{error.title}</strong>
      <span className="text-xs leading-snug">{error.message}</span>
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
        className={cn(' overflow-y-auto border-0 bg-background p-0 font-sans text-foreground sm:', className)}
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
  const reasonMessage = `Enter a reason of at least ${MIN_REASON_LENGTH} characters.`
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
      setReasonError(reasonMessage)
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
        setEmailError(err.message)
      } else if (err instanceof StaffApiError && err.code === 'REASON_REQUIRED') {
        setReasonError(err.message)
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
            aria-invalid={nameMissing(firstName) || undefined}
            value={firstName}
            placeholder="e.g. Kamon"
            maxLength={100}
            autoComplete="off"
            onChange={(e) => {
              setFirstName(e.target.value)
              setNameError(null)
            }}
          />
        </Field>
        <Field label="Last name" htmlFor={`${uid}-last`} error={nameMissing(lastName)}>
          <Input
            id={`${uid}-last`}
            aria-invalid={nameMissing(lastName) || undefined}
            value={lastName}
            placeholder="e.g. Wattana"
            maxLength={100}
            autoComplete="off"
            onChange={(e) => {
              setLastName(e.target.value)
              setNameError(null)
            }}
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
          className="disabled:opacity-100 disabled:[-webkit-text-fill-color:var(--color-muted-foreground)]"
          aria-invalid={!!emailError || undefined}
          value={email}
          placeholder="name@flython.example"
          maxLength={254}
          autoComplete="off"
          disabled={emailLocked}
          onChange={(e) => {
            setEmail(e.target.value)
            setEmailError(null)
          }}
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
          <Input id={`${uid}-code`} className="bg-accent text-muted-foreground disabled:opacity-100" value={row.staff_code} disabled />
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
          onChange={(v) => {
            setRoleId(v)
            setRoleError(null)
          }}
        />
        <Hint error={!!roleError}>
          {roleError ??
            (isEdit
              ? 'Changes the screens this person sees on their next page load.'
              : 'The role decides which screens this person can open.')}
        </Hint>
      </Field>

      {!isEdit && (
        <p className="mb-4 flex min-h-11.5 items-center gap-1 rounded-lg bg-warning-soft px-4 text-sm text-warning max-phone:mb-3 max-phone:min-h-9 max-phone:rounded-md max-phone:px-3 max-phone:text-xs">
          Staff ID will be <strong className="font-extrabold">{nextStaffCode || 'assigned on create'}.</strong>
        </p>
      )}

      <Field label="Reason (saved in the audit log)" htmlFor={`${uid}-reason`} error={!!reasonError}>
        <Input
          id={`${uid}-reason`}
          aria-invalid={!!reasonError || undefined}
          value={reason}
          placeholder={isEdit ? 'Why is this changing?' : 'Why is this account being created?'}
          maxLength={500}
          autoComplete="off"
          onChange={(e) => {
            setReason(e.target.value)
            setReasonError(null)
          }}
        />
        {reasonError && <Hint error>{reasonError}</Hint>}
      </Field>

      {boxError && <ErrorBox error={boxError} />}
    </>
  )

  const actions = (
    <footer className="flex justify-end gap-2.5 px-7 pt-4 pb-7 max-phone:gap-2 max-phone:px-0 max-phone:pt-1 max-phone:pb-0">
      <Button type="button" variant="outline" className={BTN_PHONE} onClick={onCancel} disabled={saving}>
        Cancel
      </Button>
      <Button type="submit" className={BTN_PHONE} disabled={saving}>
        {saving ? (isEdit ? 'Saving…' : 'Creating…') : isEdit ? 'Save changes' : 'Create account'}
      </Button>
    </footer>
  )

  /* Phone: the design shows Create / Edit as a page in the content area ("← Back", then the form in a card) rather
     than a pop-up, so it renders in the page flow and the list behind it is hidden (see `data-staff-sheet`). */
  if (isPhone) {
    return (
      <form onSubmit={submit} noValidate data-staff-sheet="" aria-labelledby={`${uid}-title`} className="font-sans text-foreground">
        <Button type="button" variant="link" className="mb-3 h-auto gap-1 p-0 text-xs text-primary" onClick={onCancel} disabled={saving}>
          <ArrowLeft className="size-3" strokeWidth={2.5} aria-hidden="true" />
          Back
        </Button>
        <header className="flex flex-wrap items-center gap-x-4 pb-1">
          <h2 id={`${uid}-title`} className="m-0 flex-auto font-sans text-lg leading-none font-bold tracking-tight text-foreground">
            {title}
          </h2>
          <Button
            type="button"
            variant="outline"
            className="h-7 w-9 border-border p-0"
            onClick={onCancel}
            disabled={saving}
            aria-label="Close"
          >
            <X className="size-3.5" />
          </Button>
          <p className="mt-1.5 basis-full text-xs leading-snug text-muted-foreground">{subtitleParts.join(' · ')}</p>
        </header>
        <Card className="mt-2.5 border-border p-3">
          {fields}
          {actions}
        </Card>
      </form>
    )
  }

  return (
    <Modal title={title} onClose={onCancel} busy={saving} focusContent className="w-150 border border-border">
      <form onSubmit={submit} noValidate>
        <header className="flex items-start justify-between gap-4 border-b border-border px-7 pt-7 pb-5">
          <div>
            <h2 aria-hidden="true" className="m-0 font-sans text-3xl leading-none font-bold tracking-tight text-foreground">
              {title}
            </h2>
            <DialogDescription asChild>
              <div className="mt-2 text-sm leading-snug text-muted-foreground">
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
            className="size-9 shrink-0 border-border p-0 text-foreground"
            onClick={onCancel}
            disabled={saving}
            aria-label="Close"
          >
            <X className="size-4" />
          </Button>
        </header>
        <div className="px-7 pt-6">{fields}</div>
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
      setReasonError(
        `Enter a reason of at least ${MIN_REASON_LENGTH} characters before ${deactivating ? 'deactivating' : 'activating'} this account.`,
      )
      return
    }
    setSaving(true)
    try {
      await onSubmit(reason.trim())
    } catch (err: unknown) {
      if (err instanceof StaffApiError && err.code === 'REASON_REQUIRED') setReasonError(err.message)
      else setBoxError(boxFromError(err))
      setSaving(false)
    }
  }

  return (
    <Modal
      title={`${verb} ${fullName(row)}?`}
      onClose={onCancel}
      busy={saving}
      className="w-120 p-8 max-phone:max-w-90 max-phone:rounded-lg max-phone:p-4"
    >
      <form onSubmit={submit} noValidate>
        <h2
          aria-hidden="true"
          className="m-0 font-sans text-2xl leading-tight font-semibold text-foreground max-phone:text-base max-phone:font-bold"
        >
          {verb} {fullName(row)}?
        </h2>
        <p className="mt-2.5 mb-4 text-sm leading-snug text-muted-foreground max-phone:mt-2 max-phone:mb-2.5 max-phone:text-xs">
          {deactivating
            ? `${row.first_name} won’t be able to sign in and will be signed out within 15 minutes. An Admin can turn the account back on.`
            : `${row.first_name} will be able to sign in again.`}
        </p>
        <p className="mb-5 flex min-h-12 items-center rounded-lg bg-warning-soft px-4 text-sm font-medium text-foreground max-phone:mb-3 max-phone:min-h-8.5 max-phone:rounded-md max-phone:px-2.5 max-phone:text-xs">
          This action is saved in the audit log.
        </p>
        <Field
          htmlFor={`${uid}-reason`}
          error={!!reasonError}
          label={
            <span className="text-muted-foreground">
              Reason<span className="text-danger-line">*</span>
              <span className="max-phone:hidden"> (saved in the audit log)</span>
            </span>
          }
        >
          <Input
            id={`${uid}-reason`}
            className="border-input"
            aria-invalid={!!reasonError || undefined}
            value={reason}
            placeholder={`Why is this account being ${deactivating ? 'deactivated' : 'activated'}?`}
            maxLength={500}
            autoComplete="off"
            autoFocus
            onChange={(e) => {
              setReason(e.target.value)
              setReasonError(null)
            }}
          />
          {reasonError && <Hint error>{reasonError}</Hint>}
        </Field>
        {boxError && <ErrorBox error={boxError} />}
        <footer className="flex justify-end gap-2.5 pt-1 max-phone:gap-2">
          <Button type="button" variant="outline" className={BTN_PHONE} onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" className={cn(BTN_PHONE, deactivating && 'max-phone:bg-muted max-phone:hover:bg-muted')} disabled={saving}>
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
      className="flex w-120 flex-col gap-3.5 p-7 max-phone:max-w-90 max-phone:gap-2.5 max-phone:rounded-lg max-phone:p-4"
    >
      <h2 aria-hidden="true" className="m-0 font-sans text-2xl leading-tight font-bold text-foreground max-phone:text-base">
        {info.title}
      </h2>
      <p className="text-sm leading-snug text-muted-foreground max-phone:text-xs">{info.message}</p>
      <p className="rounded-lg bg-danger-soft px-3.5 py-2.5 text-xs leading-none font-semibold text-danger max-phone:bg-warning-soft max-phone:text-xs max-phone:text-warning">
        Nothing was changed
      </p>
      <div className="flex justify-end">
        <Button type="button" className="min-w-0 max-phone:flex-1 max-phone:justify-start" onClick={onClose} autoFocus>
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

function EmptyState({ filtering, onClear, onCreate }: { filtering: boolean; onClear: () => void; onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Users className="size-6" aria-hidden="true" />
      </span>
      <div className="flex flex-col gap-1">
        <p className="font-medium text-foreground">{filtering ? 'No staff match these filters' : 'No staff accounts yet'}</p>
        <p className="text-sm text-muted-foreground">
          {filtering ? 'Try a different search, or clear the filters.' : 'Create the first account to get started.'}
        </p>
      </div>
      {filtering ? (
        <Button type="button" variant="outline" onClick={onClear}>
          Clear filters
        </Button>
      ) : (
        <Button type="button" onClick={onCreate}>
          <Plus aria-hidden="true" />
          Create staff account
        </Button>
      )}
    </div>
  )
}

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

  if (staff.loading)
    return (
      <div className="flex flex-col gap-4" role="status">
        <span className="sr-only">Loading staff accounts…</span>
        <div className="grid grid-cols-4 gap-4 max-wide:grid-cols-2 max-phone:hidden">
          {[0, 1, 2, 3].map((n) => (
            <Skeleton key={n} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    )
  if (staff.error) {
    if (staff.error.status === 403) return <NoAccessScreen screenName="Staff & roles" homeTo="/" />
    return (
      <Card className="border-border px-7 py-6 font-sans" role="alert">
        <h2 className="m-0 mb-2 font-sans text-lg font-bold text-foreground">
          Staff &amp; roles failed to load{staff.error.status ? ` — HTTP ${staff.error.status}` : ''}
        </h2>
        <p className="mb-4 text-sm break-words text-muted-foreground">{staff.error.message}</p>
        <div>
          <Button type="button" onClick={() => window.location.reload()}>
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

  return (
    <>
      {!sheetOpen && (
        <div className="flex flex-col gap-4 font-sans text-foreground">
          <div className="grid grid-cols-4 gap-4 max-wide:grid-cols-2 max-phone:hidden">
            {[
              { label: 'Total staff', value: stats.total },
              { label: 'Active accounts', value: stats.active },
              { label: 'Inactive accounts', value: stats.inactive },
              { label: 'Assigned roles', value: stats.assignedRoles },
            ].map((c) => (
              <Card key={c.label} className="gap-1 rounded-xl border-slate-300 p-4">
                <CardDescription className="text-[11px] font-semibold tracking-[0.6px] uppercase">{c.label}</CardDescription>
                <CardTitle className="text-2xl font-extrabold text-primary tabular-nums">{c.value}</CardTitle>
              </Card>
            ))}
          </div>

          {notice && (
            <Alert
              ref={noticeRef}
              role={notice.tone === 'error' ? 'alert' : 'status'}
              variant={notice.tone === 'error' ? 'destructive' : 'default'}
              className={cn(
                'scroll-mt-20',
                notice.tone === 'error' ? 'border-danger-line/40 bg-danger-soft' : 'border-success/30 bg-success-soft text-success-strong',
              )}
            >
              {notice.tone === 'error' ? <CircleAlert aria-hidden="true" /> : <CircleCheck aria-hidden="true" />}
              {notice.title && <AlertTitle className={cn(notice.desktop && 'hidden max-phone:block')}>{notice.title}</AlertTitle>}
              <AlertDescription className="text-current">
                {notice.desktop && <span className="max-phone:hidden">{notice.desktop}</span>}
                <span className={cn(notice.desktop && 'hidden max-phone:inline')}>{notice.body}</span>
              </AlertDescription>
            </Alert>
          )}

          <div
            role="search"
            aria-label="Staff filters"
            className="flex items-center gap-3 max-phone:flex-col max-phone:items-stretch max-phone:rounded-xl max-phone:border max-phone:bg-card max-phone:p-4"
          >
            <div className="flex min-w-50 flex-1 flex-col gap-1.5">
              <Label
                htmlFor="staff-search"
                className="sr-only text-[11px] font-semibold tracking-wide text-muted-foreground uppercase max-phone:not-sr-only"
              >
                Search staff
              </Label>
              <Input
                id="staff-search"
                className="h-12 rounded-[9px] border-input bg-background px-3.5 text-sm max-phone:h-10"
                type="search"
                value={query}
                placeholder="Search staff…"
                aria-label="Search staff by name, email or staff ID"
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="contents max-phone:grid max-phone:grid-cols-2 max-phone:gap-3">
              <div className="flex w-47.5 flex-col gap-1.5 max-phone:w-auto">
                <Label
                  htmlFor="staff-role-filter"
                  className="sr-only text-[11px] font-semibold tracking-wide text-muted-foreground uppercase max-phone:not-sr-only"
                >
                  Role
                </Label>
                <Dropdown
                  id="staff-role-filter"
                  variant="filter"
                  value={roleFilter}
                  options={[{ value: '', label: 'All roles' }, ...roleOptions]}
                  placeholder="All roles"
                  ariaLabel="Filter by role"
                  deselectable
                  onChange={(v) => setRoleFilter(v || null)}
                />
              </div>
              <div className="flex w-47.5 flex-col gap-1.5 max-phone:w-auto">
                <Label
                  htmlFor="staff-status-filter"
                  className="sr-only text-[11px] font-semibold tracking-wide text-muted-foreground uppercase max-phone:not-sr-only"
                >
                  Status
                </Label>
                <Dropdown
                  id="staff-status-filter"
                  variant="filter"
                  value={statusFilter}
                  options={STATUS_OPTIONS}
                  placeholder="Any status"
                  ariaLabel="Filter by status"
                  deselectable
                  onChange={(v) => setStatusFilter(v as StatusFilter | null)}
                />
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              className="h-12 rounded-[9px] border-input px-6 font-semibold max-phone:h-10"
              disabled={!filtering}
              onClick={clearFilters}
            >
              <span className="max-phone:hidden">Clear</span>
              <span className="hidden max-phone:inline">Clear filters</span>
            </Button>
            <Button
              type="button"
              className="h-12 rounded-[9px] px-6 font-semibold max-phone:h-10"
              onClick={() => openDialog({ kind: 'create' })}
            >
              Create staff account
            </Button>
          </div>

          <Card aria-labelledby="sr-table-title" role="region" className="gap-4 rounded-[14px] py-5">
            <CardHeader className="flex items-baseline justify-between px-3">
              <CardTitle id="sr-table-title" className="text-xl font-bold">
                Staff accounts
              </CardTitle>
              <CardDescription aria-live="polite" className="text-[13px]">
                {filtering
                  ? `${rows.length} matching staff account${rows.length === 1 ? '' : 's'}`
                  : `${stats.active} active of ${stats.total}`}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 px-3">
              {isPhone ? (
                /* Phone layout: one card per account instead of the table. Tapping the status pill opens the same
                 Activate / Deactivate dialog as the desktop switch; picking a role opens Edit with that role chosen,
                 because a role change always needs a reason. */
                <ul className="flex flex-col gap-2.5">
                  {rows.map((s) => (
                    <li key={s.id}>
                      <Card className="py-3.5">
                        <CardContent className="flex flex-col px-3.5">
                          <div className="flex min-h-7.75 items-start justify-between gap-2">
                            <p className="mt-0.5 text-sm leading-tight font-bold text-foreground">
                              {fullName(s)}
                              {s.id === staff.viewerStaffId && ' · You'}
                            </p>
                            <Button
                              type="button"
                              variant="ghost"
                              className={cn(
                                'shrink-0 bg-secondary px-3 text-muted-foreground hover:bg-secondary',
                                s.active && 'bg-success-soft text-success-strong hover:bg-success-soft',
                              )}
                              aria-label={`${s.active ? 'Active' : 'Inactive'} — ${s.active ? 'deactivate' : 'activate'} ${fullName(s)}`}
                              onClick={() => onToggle(s)}
                            >
                              {s.active ? 'Active' : 'Inactive'}
                            </Button>
                          </div>
                          <p className="mt-2.5 text-xs leading-tight [overflow-wrap:anywhere] text-muted-foreground">
                            {s.email} · {s.staff_code}
                          </p>
                          <div className="mt-4 grid grid-cols-2 gap-2.5">
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
                            <div className="flex h-10.25 flex-col justify-between py-0.5 text-sm whitespace-nowrap text-muted-foreground">
                              <span className="text-xs font-semibold tracking-wide uppercase">Last sign-in</span>
                              <span>{formatSignIn(s.last_sign_in_at)}</span>
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            className="mt-3 gap-2 border-input text-foreground"
                            onClick={() => openEdit(s.id)}
                          >
                            <SquarePen className="size-4" aria-hidden="true" />
                            Edit
                          </Button>
                        </CardContent>
                      </Card>
                    </li>
                  ))}
                  {rows.length === 0 && (
                    <li>
                      <EmptyState filtering={filtering} onClear={clearFilters} onCreate={() => openDialog({ kind: 'create' })} />
                    </li>
                  )}
                </ul>
              ) : (
                <Table className="table-fixed">
                  <colgroup>
                    <col className="w-42" />
                    <col className="w-49" />
                    <col className="w-24" />
                    <col />
                    <col className="w-32" />
                    <col className="w-34" />
                    <col className="w-14" />
                  </colgroup>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      {['Name', 'Email', 'Staff ID', 'Role', 'Status', 'Last sign-in'].map((h) => (
                        <TableHead key={h} className="text-[11px] font-semibold text-muted-foreground uppercase">
                          {h}
                        </TableHead>
                      ))}
                      <TableHead>
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((s) => (
                      <TableRow key={s.id} className={cn('h-12.75', s.id === staff.viewerStaffId && 'bg-muted/55')}>
                        <TableCell className="truncate text-sm font-semibold text-foreground" title={fullName(s)}>
                          {fullName(s)}
                          {s.id === staff.viewerStaffId && <Badge className="ml-2">You</Badge>}
                        </TableCell>
                        <TableCell className="truncate text-[13px] text-muted-foreground" title={s.email}>
                          {s.email}
                        </TableCell>
                        <TableCell className="text-[13px] text-foreground">{s.staff_code}</TableCell>
                        <TableCell className="truncate text-[13px] font-semibold text-foreground" title={s.role.name}>
                          {s.role.name}
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-2">
                            <Switch
                              checked={s.active}
                              aria-label={`${s.active ? 'Deactivate' : 'Activate'} ${fullName(s)}`}
                              onCheckedChange={() => onToggle(s)}
                              className="data-[state=checked]:bg-success"
                            />
                            <span className={cn('text-[13px] font-semibold text-muted-foreground', s.active && 'text-success-strong')}>
                              {s.active ? 'Active' : 'Inactive'}
                            </span>
                          </span>
                        </TableCell>
                        <TableCell className="text-[13px] text-muted-foreground">{formatSignIn(s.last_sign_in_at)}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon-sm"
                            className="rounded-lg border-slate-300"
                            aria-label={`Edit ${fullName(s)}`}
                            title="Edit"
                            onClick={() => openEdit(s.id)}
                          >
                            <img src={editIcon} alt="" className="size-4.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {rows.length === 0 && (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={7} className="whitespace-normal">
                          <EmptyState filtering={filtering} onClear={clearFilters} onCreate={() => openDialog({ kind: 'create' })} />
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
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

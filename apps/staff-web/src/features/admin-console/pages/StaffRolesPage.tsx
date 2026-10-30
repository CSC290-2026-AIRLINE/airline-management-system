import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate, useParams } from '@tanstack/react-router'
import { StaffApiError, type StaffCreateBody } from '../api/staff'
import { MIN_REASON_LENGTH, useStaff } from '../hooks/useStaff'
import { NoAccessScreen } from '../components/NoAccessScreen'
import type { RoleSummary, StaffRow } from '../types'
import './StaffRolesPage.css'

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

/* Small pieces used only on this page ------------------------------------ */

function Chevron() {
  return (
    <svg className="sr-chevron" width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path d="M2 3.5 5 6.5 8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function EditIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1.5" y="2.5" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6 10.5V9l5.5-5.5 1.5 1.5L7.5 10.5H6Z" fill="currentColor" />
    </svg>
  )
}

interface DropdownOption {
  value: string
  label: string
}

/**
 * The page's one dropdown — the role and status filters, and the Role field in the dialogs. A native `<select>` cannot
 * draw the design's open list (check mark, highlighted row), so this is a button plus a listbox. Kept in this file on
 * purpose: it is not a shared component.
 */
function Dropdown({
  id,
  value,
  options,
  placeholder,
  onChange,
  deselectable = false,
  invalid = false,
  className = '',
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
  className?: string
  ariaLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const selected = options.find((o) => o.value === value)

  useEffect(() => {
    if (!open) return
    function onPointer(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        // Close only the list, not the dialog around it.
        e.stopPropagation()
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  return (
    <div className={`sr-dropdown ${className}`} ref={ref}>
      <button
        type="button"
        id={id}
        className={`sr-dropdown-trigger${selected ? ' has-value' : ''}${invalid ? ' is-invalid' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="sr-dropdown-value">{selected?.label ?? placeholder}</span>
        <Chevron />
        {/* The phone frames draw a small solid caret instead of the desktop chevron; CSS shows one or the other. */}
        <span className="sr-caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <ul className="sr-dropdown-menu" role="listbox" aria-label={ariaLabel}>
          {options.map((o) => {
            const isSelected = o.value === value
            return (
              <li key={o.value} role="option" aria-selected={isSelected}>
                <button
                  type="button"
                  className={`sr-dropdown-item${isSelected ? ' is-selected' : ''}`}
                  onClick={() => {
                    onChange(isSelected && deselectable ? null : o.value)
                    setOpen(false)
                  }}
                >
                  <span className="sr-check" aria-hidden="true">
                    {isSelected ? '✓' : ''}
                  </span>
                  {o.label}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/** Matches the phone breakpoint in `StaffRolesPage.css`. */
const PHONE_QUERY = '(max-width: 600px)'

function isPhone(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(PHONE_QUERY).matches
}

/**
 * Backdrop + panel. Escape and a click on the backdrop both cancel, unless `busy` (a request is in flight).
 *
 * `sheet` is for Create / Edit: on a phone the design shows them as a page in the content area ("← Back", the form in
 * a card) rather than a pop-up, so the CSS turns the backdrop into normal page flow there and the page behind it is
 * hidden. There is no backdrop to tap in that layout, so a tap on blank space must not cancel.
 */
function Modal({
  labelledBy,
  onClose,
  busy = false,
  sheet = false,
  className,
  children,
}: {
  labelledBy: string
  onClose: () => void
  busy?: boolean
  sheet?: boolean
  className: string
  children: ReactNode
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  return (
    <div
      className={`sr-backdrop${sheet ? ' sr-backdrop--sheet' : ''}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy && !(sheet && isPhone())) onClose()
      }}
    >
      <div className={`sr-modal ${className}`} role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
        {children}
      </div>
    </div>
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

  const titleId = `${uid}-title`
  const subtitle = isEdit ? (
    <>
      <span>
        {row.staff_code} · Created {formatDate(row.created_at)}
        {!row.claimed && ' · Not signed in yet'}
        {!row.claimed && isSelf && ' · You'}
      </span>
      {row.claimed && (row.last_sign_in_at || isSelf) && (
        <span>
          {row.last_sign_in_at ? `Last sign-in ${formatSignIn(row.last_sign_in_at)}` : ''}
          {row.last_sign_in_at && isSelf ? ' · ' : ''}
          {isSelf ? 'You' : ''}
        </span>
      )}
    </>
  ) : (
    <span>The account is provisioned first. At the first Clerk sign-in using this email, the staff member claims it.</span>
  )

  return (
    <Modal labelledBy={titleId} onClose={onCancel} busy={saving} sheet className="sr-modal--form">
      <form onSubmit={submit} noValidate>
        {/* Phone only: the form is a page there, and the design leads with a back link. */}
        <button type="button" className="sr-back" onClick={onCancel} disabled={saving}>
          ← Back
        </button>
        <header className="sr-modal-head">
          <div>
            <h2 id={titleId}>{isEdit ? 'Edit staff account' : 'Create staff account'}</h2>
            <p className="sr-modal-sub">{subtitle}</p>
          </div>
          <button type="button" className="sr-close" onClick={onCancel} disabled={saving} aria-label="Close">
            ×
          </button>
        </header>

        {/* No box of its own on desktop (`display: contents`); on a phone it is the white card holding the fields. */}
        <div className="sr-form-card">
          <div className="sr-modal-body">
            <div className="sr-name-row">
              <div className={`sr-field${nameError && !firstName.trim() ? ' has-error' : ''}`}>
                <label htmlFor={`${uid}-first`}>First name</label>
                <input
                  id={`${uid}-first`}
                  className={`sr-input${nameError && !firstName.trim() ? ' is-invalid' : ''}`}
                  value={firstName}
                  placeholder="e.g. Kamon"
                  maxLength={100}
                  autoComplete="off"
                  onChange={(e) => setFirstName(e.target.value)}
                />
              </div>
              <div className={`sr-field${nameError && !lastName.trim() ? ' has-error' : ''}`}>
                <label htmlFor={`${uid}-last`}>Last name</label>
                <input
                  id={`${uid}-last`}
                  className={`sr-input${nameError && !lastName.trim() ? ' is-invalid' : ''}`}
                  value={lastName}
                  placeholder="e.g. Wattana"
                  maxLength={100}
                  autoComplete="off"
                  onChange={(e) => setLastName(e.target.value)}
                />
              </div>
            </div>
            {nameError && <p className="sr-hint is-error">{nameError}</p>}

            <div className={`sr-field${emailError ? ' has-error' : ''}`}>
              <label htmlFor={`${uid}-email`}>Work email</label>
              <input
                id={`${uid}-email`}
                type="email"
                className={`sr-input${emailError ? ' is-invalid' : ''}`}
                value={email}
                placeholder="name@flython.example"
                maxLength={254}
                autoComplete="off"
                disabled={emailLocked}
                onChange={(e) => setEmail(e.target.value)}
              />
              <p className={`sr-hint${emailError ? ' is-error' : ''}`}>
                {emailError ??
                  (!isEdit
                    ? 'Must not be used by another staff account.'
                    : emailLocked
                      ? 'Claimed after first Clerk sign-in — work email can no longer be changed.'
                      : `Not claimed yet — you can still fix the email until ${row.first_name} signs in for the first time.`)}
              </p>
            </div>

            {isEdit && (
              <div className="sr-field">
                <label htmlFor={`${uid}-code`}>Staff ID</label>
                <input id={`${uid}-code`} className="sr-input sr-input--readonly" value={row.staff_code} disabled />
                <p className="sr-hint">Made by the system. Can&apos;t be edited.</p>
              </div>
            )}

            <div className={`sr-field${roleError ? ' has-error' : ''}`}>
              <label htmlFor={`${uid}-role`}>Role</label>
              <Dropdown
                id={`${uid}-role`}
                className="sr-dropdown--field"
                value={roleId}
                options={roles.map((r) => ({ value: r.id, label: r.name }))}
                placeholder="Choose a role"
                invalid={roleError !== null}
                onChange={(v) => setRoleId(v)}
              />
              <p className={`sr-hint${roleError ? ' is-error' : ''}`}>
                {roleError ??
                  (isEdit
                    ? 'Changes the screens this person sees on their next page load.'
                    : 'The role decides which screens this person can open.')}
              </p>
            </div>

            {!isEdit && (
              <p className="sr-code-note">
                Staff ID will be <strong>{nextStaffCode || 'assigned on create'}.</strong>
              </p>
            )}

            <div className={`sr-field${reasonError ? ' has-error' : ''}`}>
              <label htmlFor={`${uid}-reason`}>Reason (saved in the audit log)</label>
              <input
                id={`${uid}-reason`}
                className={`sr-input${reasonError ? ' is-invalid' : ''}`}
                value={reason}
                placeholder={isEdit ? 'Why is this changing?' : 'Why is this account being created?'}
                maxLength={500}
                autoComplete="off"
                onChange={(e) => setReason(e.target.value)}
              />
              {reasonError && <p className="sr-hint is-error">{reasonError}</p>}
            </div>

            {boxError && (
              <div className="sr-error-box" role="alert">
                <strong>{boxError.title}</strong>
                <span>
                  {boxError.message} ({boxError.code})
                </span>
              </div>
            )}
          </div>

          <footer className="sr-modal-actions">
            <button type="button" className="sr-btn sr-btn--ghost" onClick={onCancel} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="sr-btn sr-btn--primary" disabled={saving}>
              {saving ? (isEdit ? 'Saving…' : 'Creating…') : isEdit ? 'Save changes' : 'Create account'}
            </button>
          </footer>
        </div>
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
    <Modal labelledBy={`${uid}-title`} onClose={onCancel} busy={saving} className="sr-modal--confirm">
      <form onSubmit={submit} noValidate>
        <h2 id={`${uid}-title`} className="sr-confirm-title">
          {verb} {fullName(row)}?
        </h2>
        <p className="sr-confirm-text">
          {deactivating
            ? `${row.first_name} won’t be able to sign in and will be signed out within 15 minutes. An Admin can turn the account back on.`
            : `${row.first_name} will be able to sign in again.`}
        </p>
        <p className="sr-audit-note">This action is saved in the audit log.</p>
        <div className="sr-field">
          <label htmlFor={`${uid}-reason`}>
            Reason<span className="sr-required">*</span>
            <span className="sr-desktop-only"> (saved in the audit log)</span>
          </label>
          <input
            id={`${uid}-reason`}
            className={`sr-input sr-input--short${reasonError ? ' is-invalid' : ''}`}
            value={reason}
            placeholder={`Why is this account being ${deactivating ? 'deactivated' : 'activated'}?`}
            maxLength={500}
            autoComplete="off"
            autoFocus
            onChange={(e) => setReason(e.target.value)}
          />
          {reasonError && <p className="sr-hint is-error">{reasonError}</p>}
        </div>
        {boxError && (
          <div className="sr-error-box" role="alert">
            <strong>{boxError.title}</strong>
            <span>
              {boxError.message} ({boxError.code})
            </span>
          </div>
        )}
        <footer className="sr-modal-actions sr-modal-actions--confirm">
          <button type="button" className="sr-btn sr-btn--ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          <button
            type="submit"
            className={`sr-btn sr-btn--primary sr-btn--wide${deactivating ? ' sr-btn--danger-phone' : ''}`}
            disabled={saving}
          >
            {saving ? `${verb === 'Deactivate' ? 'Deactivating' : 'Activating'}…` : verb}
          </button>
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
  const uid = useId()
  return (
    <Modal labelledBy={`${uid}-title`} onClose={onClose} className="sr-modal--blocked">
      <h2 id={`${uid}-title`} className="sr-blocked-title">
        {info.title}
      </h2>
      <p className="sr-blocked-text">{info.message}</p>
      <p className="sr-blocked-chip">
        <span className="sr-desktop-only">Error </span>
        {info.code} · nothing was changed
      </p>
      <div className="sr-modal-actions sr-modal-actions--blocked">
        <button type="button" className="sr-btn sr-btn--primary sr-btn--okay" onClick={onClose} autoFocus>
          <span className="sr-desktop-only">Okay</span>
          <span className="sr-phone-only">Got it</span>
        </button>
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

  if (staff.loading) return <p className="muted">Loading staff accounts…</p>
  if (staff.error) {
    if (staff.error.status === 403) return <NoAccessScreen screenName="Staff & roles" homeTo="/" />
    return (
      <section className="sr-load-error" role="alert">
        <h2>Staff &amp; roles failed to load{staff.error.status ? ` — HTTP ${staff.error.status}` : ''}</h2>
        <p>{staff.error.message}</p>
        <button type="button" className="sr-btn sr-btn--primary" onClick={() => window.location.reload()}>
          Retry
        </button>
      </section>
    )
  }

  const editRow = staffId ? (staff.staff.find((s) => s.id === staffId) ?? null) : null
  const editRoleId = editRow && editRoleHint?.id === editRow.id ? editRoleHint.roleId : undefined
  const statusRow = dialog?.kind === 'status' ? (staff.staff.find((s) => s.id === dialog.id) ?? null) : null

  return (
    <>
      <div className="sr-page">
        <div className="sr-stats">
          {[
            { label: 'Total staff', value: stats.total },
            { label: 'Active accounts', value: stats.active },
            { label: 'Inactive accounts', value: stats.inactive },
            { label: 'Assigned roles', value: stats.assignedRoles },
          ].map((c) => (
            <div key={c.label} className="sr-stat">
              <span className="sr-stat-label">{c.label}</span>
              <span className="sr-stat-value">{c.value}</span>
            </div>
          ))}
        </div>

        {notice && (
          <div
            ref={noticeRef}
            className={`sr-notice${notice.tone === 'error' ? ' is-error' : ''}`}
            role={notice.tone === 'error' ? 'alert' : 'status'}
          >
            {notice.desktop && <span className="sr-desktop-only">{notice.desktop}</span>}
            <span className={`sr-notice-parts${notice.desktop ? ' sr-phone-only' : ''}`}>
              {notice.title && <strong>{notice.title}</strong>}
              <span>{notice.body}</span>
            </span>
          </div>
        )}

        {/* One row on desktop; on a phone the same controls stack into a card with small labels, as in the design. */}
        <div className="sr-filters">
          <label className="sr-filter sr-filter--search">
            <span className="sr-filter-label">Search staff</span>
            <input
              className="sr-search"
              type="search"
              value={query}
              placeholder="Search staff…"
              aria-label="Search staff by name, email or staff ID"
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <div className="sr-filter">
            <span className="sr-filter-label" aria-hidden="true">
              Role
            </span>
            <Dropdown
              className="sr-dropdown--filter"
              value={roleFilter}
              options={roleOptions}
              placeholder="All roles"
              ariaLabel="Filter by role"
              deselectable
              onChange={setRoleFilter}
            />
          </div>
          <div className="sr-filter">
            <span className="sr-filter-label" aria-hidden="true">
              Status
            </span>
            <Dropdown
              className="sr-dropdown--filter"
              value={statusFilter}
              options={STATUS_OPTIONS}
              placeholder="Any status"
              ariaLabel="Filter by status"
              deselectable
              onChange={(v) => setStatusFilter(v as StatusFilter | null)}
            />
          </div>
          <button type="button" className="sr-btn sr-btn--ghost sr-btn--clear" onClick={clearFilters}>
            Clear<span className="sr-phone-only"> filters</span>
          </button>
          <button type="button" className="sr-btn sr-btn--primary sr-btn--create" onClick={() => openDialog({ kind: 'create' })}>
            Create staff account
          </button>
        </div>

        <section className="sr-table-card" aria-labelledby="sr-table-title">
          <header className="sr-table-head">
            <h2 id="sr-table-title">Staff accounts</h2>
            <span className="sr-table-count">
              {filtering ? (
                <>
                  <span className="sr-desktop-only">{`${rows.length} matching staff account${rows.length === 1 ? '' : 's'}`}</span>
                  <span className="sr-phone-only">{`${rows.length} result${rows.length === 1 ? '' : 's'}`}</span>
                </>
              ) : (
                `${stats.active} active of ${stats.total}`
              )}
            </span>
          </header>
          <div className="sr-table-scroll">
            <table className="sr-table">
              <colgroup>
                <col className="sr-col-name" />
                <col className="sr-col-email" />
                <col className="sr-col-code" />
                <col className="sr-col-role" />
                <col className="sr-col-status" />
                <col className="sr-col-signin" />
                <col className="sr-col-edit" />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Email</th>
                  <th scope="col">Staff ID</th>
                  <th scope="col">Role</th>
                  <th scope="col">Status</th>
                  <th scope="col">Last sign-in</th>
                  <th scope="col">
                    <span className="sr-visually-hidden">Edit</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id}>
                    <td className="sr-cell-name">
                      {fullName(s)}
                      {s.id === staff.viewerStaffId && <span className="sr-you">You</span>}
                    </td>
                    <td className="sr-cell-email">{s.email}</td>
                    <td className="sr-cell-code">{s.staff_code}</td>
                    <td className="sr-cell-role">{s.role.name}</td>
                    <td>
                      <span className="sr-status">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={s.active}
                          aria-label={`${s.active ? 'Deactivate' : 'Activate'} ${fullName(s)}`}
                          className={`sr-toggle${s.active ? ' is-on' : ''}`}
                          onClick={() => onToggle(s)}
                        >
                          <span className="sr-toggle-knob" />
                        </button>
                        <span className={`sr-status-text${s.active ? ' is-on' : ''}`}>{s.active ? 'Active' : 'Inactive'}</span>
                      </span>
                    </td>
                    <td className="sr-cell-signin">{formatSignIn(s.last_sign_in_at)}</td>
                    <td className="sr-cell-edit">
                      <button
                        type="button"
                        className="sr-edit"
                        aria-label={`Edit ${fullName(s)}`}
                        title="Edit"
                        onClick={() => openEdit(s.id)}
                      >
                        <EditIcon />
                      </button>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="sr-empty">
                      {filtering ? 'No staff accounts match these filters.' : 'No staff accounts yet.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Phone layout: one card per account instead of the table. Tapping the status pill opens the same
              Activate / Deactivate dialog as the desktop switch; picking a role opens Edit with that role chosen,
              because a role change always needs a reason. */}
          <ul className="sr-cards">
            {rows.map((s) => (
              <li key={s.id} className="sr-card">
                <div className="sr-card-top">
                  <p className="sr-card-name">
                    {fullName(s)}
                    {s.id === staff.viewerStaffId && ' · You'}
                  </p>
                  <button
                    type="button"
                    className={`sr-pill${s.active ? ' is-on' : ''}`}
                    aria-label={`${s.active ? 'Active' : 'Inactive'} — ${s.active ? 'deactivate' : 'activate'} ${fullName(s)}`}
                    onClick={() => onToggle(s)}
                  >
                    {s.active ? 'Active' : 'Inactive'}
                  </button>
                </div>
                <p className="sr-card-meta">
                  {s.email} · {s.staff_code}
                </p>
                <div className="sr-card-row">
                  <Dropdown
                    className="sr-dropdown--card"
                    value={s.role.id}
                    options={roleOptions}
                    placeholder={s.role.name}
                    ariaLabel={`Role for ${fullName(s)}`}
                    onChange={(v) => {
                      if (v && v !== s.role.id) openEdit(s.id, v)
                    }}
                  />
                  <div className="sr-card-signin">
                    <span className="sr-card-signin-label">Last sign-in</span>
                    <span>{formatSignIn(s.last_sign_in_at)}</span>
                  </div>
                </div>
                <button type="button" className="sr-card-edit" onClick={() => openEdit(s.id)}>
                  <EditIcon />
                  Edit
                </button>
              </li>
            ))}
            {rows.length === 0 && (
              <li className="sr-card sr-card--empty">{filtering ? 'No staff accounts match these filters.' : 'No staff accounts yet.'}</li>
            )}
          </ul>
        </section>
      </div>

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

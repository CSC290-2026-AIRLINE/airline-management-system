import { useId, useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { Button } from '@staff-web/components/ui/button'
import { Input } from '@staff-web/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@staff-web/components/ui/select'
import { ApiError, errorText } from '../api/fetch'
import type { RoleErrorCode, RoleSummary } from '../types'
import { ErrorBox, Field, Hint, type BoxError } from './form-fields'
import { Modal } from './Modal'

/** Mirrors `MIN_REASON_LENGTH` in the backend's `DeleteRoleDto`. */
const MIN_REASON_LENGTH = 10

/** The picker's value for "the No access role" — Radix Select has no empty value, and the role may not exist yet. */
const NO_ACCESS = 'no_access'

const BOX_TITLES: Partial<Record<RoleErrorCode, string>> = {
  ROLE_IN_USE: 'The role is still in use',
  MOVE_TARGET_INVALID: 'Pick another role for the staff',
  ROLE_NOT_DELETABLE: 'This role cannot be deleted',
  ROLE_NOT_FOUND: 'Role not found',
  VALIDATION_FAILED: 'Some fields need fixing',
}

/**
 * The delete confirmation for a role.
 *
 * When staff who can sign in hold the role, the admin picks where they go: any other non-admin role, or No access (the
 * default, which leaves them only the Core screens). Admin roles are not offered — giving several people the admin
 * console at once is done one person at a time on Staff & roles. A delete is an audited admin change like any other,
 * so it asks for a reason. The role is gone for good — the `role`
 * table has no `deleted_at` — but the audit row keeps its name and code, so the history survives.
 */
export function DeleteRoleDialog({
  role,
  roles,
  onCancel,
  onSubmit,
}: {
  role: RoleSummary
  /** Every role, for the "Move them to" picker. */
  roles: RoleSummary[]
  onCancel: () => void
  /**
   * Resolves when the role was deleted; rejects with the API error, which the dialog turns into a message. `moveTo` is
   * the role the staff go to, or `undefined` for No access.
   */
  onSubmit: (reason: string, moveTo: RoleSummary | undefined) => Promise<void>
}) {
  const uid = useId()
  const [reason, setReason] = useState('')
  const [moveToId, setMoveToId] = useState(NO_ACCESS)
  const staffCount = role.staff_count
  const targets = roles.filter((r) => r.id !== role.id && !r.is_admin && !r.is_system).sort((a, b) => a.name.localeCompare(b.name))
  const moveTo = targets.find((r) => r.id === moveToId)
  const [reasonError, setReasonError] = useState<string | null>(null)
  const [boxError, setBoxError] = useState<BoxError | null>(null)
  const [deleting, setDeleting] = useState(false)

  const reasonOk = reason.trim().length >= MIN_REASON_LENGTH

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (deleting) return
    setReasonError(null)
    setBoxError(null)
    if (!reasonOk) {
      setReasonError(`Enter a reason of at least ${MIN_REASON_LENGTH} characters before deleting this role.`)
      return
    }
    setDeleting(true)
    try {
      await onSubmit(reason.trim(), moveTo)
    } catch (err) {
      if (err instanceof ApiError) {
        const code = (err.code ?? '') as RoleErrorCode
        const message = errorText(err)
        if (code === 'REASON_REQUIRED') setReasonError(message)
        else setBoxError({ title: BOX_TITLES[code] ?? "Couldn't delete the role", message, code })
      } else {
        setBoxError({
          title: "Couldn't delete the role",
          message: err instanceof Error ? err.message : String(err),
          code: 'ERROR',
        })
      }
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Modal title={`Delete the ${role.name} role`} onClose={onCancel} busy={deleting} focusContent className="w-150 border border-border">
      <form onSubmit={submit} noValidate>
        <header className="flex items-start justify-between gap-4 border-b border-border px-7 pt-7 pb-5">
          <div>
            <h2 aria-hidden="true" className="m-0 font-sans text-3xl leading-none font-bold tracking-tight text-foreground">
              Delete role
            </h2>
            <p className="mt-2 mb-0 text-sm leading-snug text-muted-foreground">
              The <strong className="font-semibold text-foreground">{role.name}</strong> role will be removed.{' '}
              {staffCount === 0
                ? 'Nobody who can sign in holds it, so nobody loses access.'
                : `${staffCount} staff member${staffCount === 1 ? '' : 's'} who can sign in hold${staffCount === 1 ? 's' : ''} it.`}
            </p>
            <p className="mt-1 mb-0 text-sm leading-snug text-muted-foreground">
              Any account that cannot sign in and still points at this role is moved to the No access role.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="size-9 shrink-0 border-border p-0 text-foreground"
            onClick={onCancel}
            disabled={deleting}
            aria-label="Close"
          >
            <X className="size-4" />
          </Button>
        </header>

        <div className="px-7 pt-6">
          {staffCount > 0 && (
            <Field label={`Move ${staffCount === 1 ? 'them' : `all ${staffCount}`} to`} htmlFor={`${uid}-move`}>
              <Select value={moveToId} onValueChange={setMoveToId} disabled={deleting}>
                <SelectTrigger id={`${uid}-move`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" className="font-sans">
                  <SelectItem value={NO_ACCESS}>No access</SelectItem>
                  {targets.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Hint>
                {moveTo
                  ? `They get the ${moveTo.name} role's screens. Admin roles can't be picked here.`
                  : 'They keep only the Core screens until you give them a new role on Staff & roles.'}
              </Hint>
            </Field>
          )}
          <Field label="Reason (saved in the audit log)" htmlFor={`${uid}-reason`} error={!!reasonError}>
            <Input
              id={`${uid}-reason`}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value)
                if (reasonError) setReasonError(null)
              }}
              aria-invalid={!!reasonError || undefined}
              placeholder="e.g. The team was merged into another role"
              maxLength={500}
              autoFocus
            />
            <Hint error={!!reasonError}>{reasonError ?? `At least ${MIN_REASON_LENGTH} characters, so the audit log says why.`}</Hint>
          </Field>

          {boxError && (
            <div className="mt-4">
              <ErrorBox error={boxError} />
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2.5 px-7 pt-6 pb-7">
          <Button type="button" variant="outline" onClick={onCancel} disabled={deleting}>
            Cancel
          </Button>
          <Button type="submit" variant="destructive" disabled={!reasonOk || deleting}>
            {deleting ? 'Deleting…' : 'Delete role'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

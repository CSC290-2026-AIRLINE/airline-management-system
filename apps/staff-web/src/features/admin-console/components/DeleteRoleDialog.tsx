import { useId, useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { Button } from '@staff-web/components/ui/button'
import { Input } from '@staff-web/components/ui/input'
import { RoleApiError } from '../api/roles'
import type { RoleSummary } from '../types'
import { ErrorBox, Field, Hint, type BoxError } from './form-fields'
import { Modal } from './Modal'

/** Mirrors `MIN_REASON_LENGTH` in the backend's `DeleteRoleDto`. */
const MIN_REASON_LENGTH = 10

const BOX_TITLES: Record<string, string> = {
  ROLE_IN_USE: 'The role is still in use',
  ROLE_NOT_DELETABLE: 'The Admin role cannot be deleted',
  ROLE_NOT_FOUND: 'Role not found',
  VALIDATION_FAILED: 'Some fields need fixing',
}

/**
 * The delete confirmation for a role that nobody holds.
 *
 * A delete is an audited admin change like any other, so it asks for a reason. The role is gone for good — the `role`
 * table has no `deleted_at` — but the audit row keeps its name and code, so the history survives.
 */
export function DeleteRoleDialog({
  role,
  onCancel,
  onSubmit,
}: {
  role: RoleSummary
  onCancel: () => void
  /** Resolves when the role was deleted; rejects with the API error, which the dialog turns into a message. */
  onSubmit: (reason: string) => Promise<void>
}) {
  const uid = useId()
  const [reason, setReason] = useState('')
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
      await onSubmit(reason.trim())
    } catch (err) {
      if (err instanceof RoleApiError) {
        if (err.code === 'REASON_REQUIRED') setReasonError(err.message)
        else setBoxError({ title: BOX_TITLES[err.code] ?? "Couldn't delete the role", message: err.message, code: err.code })
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
              The <strong className="font-semibold text-foreground">{role.name}</strong> role will be removed. Nobody holds it, so nobody
              loses access.
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
          </Field>
          <Hint error={!!reasonError}>{reasonError ?? `At least ${MIN_REASON_LENGTH} characters, so the audit log says why.`}</Hint>

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

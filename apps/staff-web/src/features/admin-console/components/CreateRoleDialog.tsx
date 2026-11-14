import { useId, useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { Button } from '@staff-web/components/ui/button'
import { Input } from '@staff-web/components/ui/input'
import { RoleApiError, type CreateRoleBody } from '../api/roles'
import type { DisplayGroup } from '../screen-groups'
import type { ScreenDto, ScreenKind } from '../types'
import { ErrorBox, Field, Hint, type BoxError } from './form-fields'
import { Modal } from './Modal'
import { ScreenRows } from './ScreenRows'

/** Mirrors `MIN_REASON_LENGTH` in the backend's `CreateRoleDto` — the same number, checked on both sides. */
const MIN_REASON_LENGTH = 10

/** The dialog-level title for each code the backend can answer with. */
const BOX_TITLES: Record<string, string> = {
  ROLE_NAME_TAKEN: 'That name is taken',
  ROLE_CODE_TAKEN: 'That name collides with another role',
  ROLE_NOT_FOUND: 'Role not found',
  ROLE_IN_USE: 'The role is still in use',
  ROLE_NOT_DELETABLE: 'The Admin role cannot be deleted',
  VALIDATION_FAILED: 'Some fields need fixing',
}

/**
 * The Create role pop-up.
 *
 * Left: the role's name, the reason (which goes into the audit log), and a count of the screens picked. Right: the
 * screen list, with the same lock rules as the Role access matrix — core screens are on for every role, admin screens
 * are only for the Admin role, and only assignable screens can be ticked.
 *
 * The dialog owns its own form state and maps the backend's error code onto the field it belongs to: a name that is
 * taken shows under the name field, a missing reason under the reason field, and anything else in the red box above the
 * buttons.
 */
export function CreateRoleDialog({
  groups,
  onCancel,
  onSubmit,
}: {
  /** Every registered screen, grouped by feature. */
  groups: DisplayGroup[]
  onCancel: () => void
  /** Resolves when the role was created; rejects with the API error, which the dialog turns into a message. */
  onSubmit: (body: CreateRoleBody) => Promise<void>
}) {
  const uid = useId()
  const [name, setName] = useState('')
  const [reason, setReason] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [nameError, setNameError] = useState<string | null>(null)
  const [reasonError, setReasonError] = useState<string | null>(null)
  const [boxError, setBoxError] = useState<BoxError | null>(null)
  const [creating, setCreating] = useState(false)

  const reasonOk = reason.trim().length >= MIN_REASON_LENGTH
  const canSubmit = name.trim() !== '' && reasonOk && !creating

  function clearErrors() {
    setNameError(null)
    setReasonError(null)
    setBoxError(null)
  }

  /** A new role is never an admin role, so admin screens show unticked and locked. */
  function isChecked(s: ScreenDto): boolean {
    if (s.kind === 'core') return true
    if (s.kind === 'admin') return false
    return selected.has(s.id)
  }

  function toggle(screenId: string, kind: ScreenKind) {
    if (kind !== 'assignable') return
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(screenId)) next.delete(screenId)
      else next.add(screenId)
      return next
    })
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (creating) return
    clearErrors()
    if (name.trim() === '') {
      setNameError('Enter a role name.')
      return
    }
    if (!reasonOk) {
      setReasonError(`Enter a reason of at least ${MIN_REASON_LENGTH} characters.`)
      return
    }
    setCreating(true)
    try {
      await onSubmit({ name: name.trim(), reason: reason.trim(), screen_ids: [...selected] })
    } catch (err) {
      if (err instanceof RoleApiError) {
        if (err.code === 'ROLE_NAME_TAKEN' || err.code === 'ROLE_CODE_TAKEN') setNameError(err.message)
        else if (err.code === 'REASON_REQUIRED') setReasonError(err.message)
        else setBoxError({ title: BOX_TITLES[err.code] ?? "Couldn't create the role", message: err.message, code: err.code })
      } else {
        setBoxError({
          title: "Couldn't create the role",
          message: err instanceof Error ? err.message : String(err),
          code: 'ERROR',
        })
      }
    } finally {
      setCreating(false)
    }
  }

  return (
    <Modal title="Create role" onClose={onCancel} busy={creating} focusContent className="w-220 border border-border">
      <form onSubmit={submit} noValidate>
        <header className="flex items-start justify-between gap-4 border-b border-border px-7 pt-7 pb-5">
          <div>
            <h2 aria-hidden="true" className="m-0 font-sans text-3xl leading-none font-bold tracking-tight text-foreground">
              Create role
            </h2>
            <p className="mt-2 mb-0 text-sm leading-snug text-muted-foreground">
              Name the role and tick the screens it can open. You can change its screens later on the Role access page.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="size-9 shrink-0 border-border p-0 text-foreground"
            onClick={onCancel}
            disabled={creating}
            aria-label="Close"
          >
            <X className="size-4" />
          </Button>
        </header>

        <div className="grid grid-cols-[1fr_1.15fr] gap-7 px-7 pt-6 max-tablet:grid-cols-1">
          {/* Left: the form --------------------------------------------- */}
          <div>
            <Field label="Role name" htmlFor={`${uid}-name`} error={!!nameError}>
              <Input
                id={`${uid}-name`}
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  if (nameError) setNameError(null)
                }}
                aria-invalid={!!nameError || undefined}
                placeholder="e.g. Revenue Analyst"
                maxLength={100}
                autoFocus
              />
            </Field>
            <Hint error={!!nameError}>{nameError ?? 'Shown in the role list and on staff accounts. Must be unique.'}</Hint>

            <Field label="Reason (saved in the audit log)" htmlFor={`${uid}-reason`} error={!!reasonError}>
              <Input
                id={`${uid}-reason`}
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value)
                  if (reasonError) setReasonError(null)
                }}
                aria-invalid={!!reasonError || undefined}
                placeholder="e.g. New revenue team needs payment reports"
                maxLength={500}
              />
            </Field>
            <Hint error={!!reasonError}>{reasonError ?? `At least ${MIN_REASON_LENGTH} characters, so the audit log says why.`}</Hint>

            <div className="mt-5 rounded-lg border border-border bg-muted/40 px-4 py-3">
              <p className="m-0 text-sm font-semibold text-foreground">
                {selected.size} screen{selected.size === 1 ? '' : 's'} selected
              </p>
              <p className="mt-1 mb-0 text-xs leading-snug text-muted-foreground">
                Core screens are on for every role. Admin screens are only for the Admin role.
              </p>
            </div>

            {boxError && (
              <div className="mt-4">
                <ErrorBox error={boxError} />
              </div>
            )}
          </div>

          {/* Right: the screen picker ----------------------------------- */}
          <div className="flex max-h-[26rem] flex-col overflow-y-auto rounded-lg border border-border">
            {groups.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">No screens registered yet.</p>
            ) : (
              groups.map((group) => (
                <section key={group.key} aria-label={group.title}>
                  <header className="bg-muted py-2.5 pl-3 text-xs font-semibold text-foreground uppercase">{group.title}</header>
                  <ScreenRows screens={group.screens} isChecked={isChecked} unsavedIds={new Set()} isAdminRole={false} onToggle={toggle} />
                </section>
              ))
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2.5 px-7 pt-6 pb-7">
          <Button type="button" variant="outline" onClick={onCancel} disabled={creating}>
            Cancel
          </Button>
          <Button type="submit" disabled={!canSubmit}>
            {creating ? 'Creating…' : 'Create role'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

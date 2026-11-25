// Small CRUD dialog used to manage a list of named items (warehouses,
// suppliers). Header + a top-of-dialog add form, then a list of rows
// each with a kebab menu (Edit / Delete). Reuses KebabMenu,
// ConfirmDeleteDialog, useDialogFocusTrap and the shared navy styling.

import { useMemo, useState, type FormEvent } from 'react'
import { Alert, AlertDescription } from '@staff-web/components/ui/alert'
import { Button } from '@staff-web/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@staff-web/components/ui/dialog'
import { Input } from '@staff-web/components/ui/input'
import { Label } from '@staff-web/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@staff-web/components/ui/native-select'
import { KebabMenu } from '../catalog/KebabMenu'
import { ConfirmDeleteDialog } from '../catalog/ConfirmDeleteDialog'

export interface ManageListItem {
  id: string
  name: string
  secondary?: string
  /** When true, the item cannot be deleted through the dialog. */
  isProtected?: boolean
  /** Optional helper text shown under the name in the row. */
  hint?: string
}

/** One choice in the add form's dropdown, for lists whose items come from another list (an airport from the flight network). */
export interface ManageListOption {
  value: string
  /** What the dropdown shows. */
  label: string
  /** The name the new item gets. */
  name: string
}

export interface ManageListInput {
  name: string
  secondary: string
}

interface Props {
  title: string
  subtitle: string
  nameLabel: string
  secondaryLabel?: string
  /** When set, the secondary field is shown for every item and is required. */
  secondaryRequired?: boolean
  /** When set, adding an item means picking one of these instead of typing a name and a code. */
  addOptions?: ManageListOption[]
  addOptionLabel?: string
  /** Shown instead of the dropdown when every option has been added. */
  addOptionsEmptyMessage?: string
  items: ManageListItem[]
  emptyMessage: string
  addLabel: string
  busy: boolean
  onClose: () => void
  onCreate: (input: ManageListInput) => Promise<void>
  onUpdate: (id: string, input: ManageListInput) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

export function ManageListDialog(props: Props) {
  const {
    title,
    subtitle,
    nameLabel,
    secondaryLabel,
    secondaryRequired,
    addOptions,
    addOptionLabel,
    addOptionsEmptyMessage,
    items,
    emptyMessage,
    addLabel,
    busy,
    onClose,
    onCreate,
    onUpdate,
    onDelete,
  } = props

  type EditState = { mode: 'create' } | { mode: 'edit'; id: string; initial: ManageListInput }
  const [editState, setEditStateRaw] = useState<EditState>({ mode: 'create' })
  const [name, setName] = useState('')
  const [secondary, setSecondary] = useState('')
  const [picked, setPicked] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<ManageListItem | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  function setEditState(next: EditState) {
    // Reset the form whenever we transition into a new edit state so the
    // inputs reflect what the user is now editing (or are blank for create).
    if (next.mode === 'create') {
      setName('')
      setSecondary('')
      setPicked('')
      setError(null)
    } else if (next.mode === 'edit') {
      setName(next.initial.name)
      setSecondary(next.initial.secondary)
      setError(null)
    }
    setEditStateRaw(next)
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    if (editState.mode === 'create' && addOptions) {
      const option = addOptions.find((o) => o.value === picked)
      if (!option) {
        setError(`Pick ${addOptionLabel ? `an ${addOptionLabel.toLowerCase()}` : 'one'} from the list.`)
        return
      }
      try {
        await onCreate({ name: option.name, secondary: option.value })
        setEditState({ mode: 'create' })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not save the item.')
      }
      return
    }
    const trimmedName = name.trim()
    const trimmedSecondary = secondary.trim()
    if (trimmedName === '') {
      setError(`${nameLabel} is required.`)
      return
    }
    if (secondaryRequired && trimmedSecondary === '') {
      setError(`${secondaryLabel ?? 'Code'} is required.`)
      return
    }
    try {
      if (editState.mode === 'create') {
        await onCreate({ name: trimmedName, secondary: trimmedSecondary })
      } else if (editState.mode === 'edit') {
        await onUpdate(editState.id, { name: trimmedName, secondary: trimmedSecondary })
      }
      setEditState({ mode: 'create' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the item.')
    }
  }

  async function handleDelete() {
    if (!deleting) return
    setDeleteBusy(true)
    setDeleteError(null)
    try {
      await onDelete(deleting.id)
      setDeleting(null)
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Could not remove the item.')
    } finally {
      setDeleteBusy(false)
    }
  }

  const showSecondaryField = secondaryLabel != null
  const sortedItems = useMemo(() => items.slice().sort((a, b) => a.name.localeCompare(b.name)), [items])

  return (
    <>
      <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
        <DialogContent className="max-h-[90vh] gap-4 overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{subtitle}</DialogDescription>
          </DialogHeader>

          <form className="flex flex-col gap-3 rounded-lg border bg-muted/40 p-4" onSubmit={onSubmit} noValidate>
            {editState.mode === 'create' && addOptions ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ml-pick">{addOptionLabel ?? nameLabel}</Label>
                {addOptions.length === 0 ? (
                  <p className="m-0 text-sm text-muted-foreground">{addOptionsEmptyMessage ?? 'Everything is already on the list.'}</p>
                ) : (
                  <NativeSelect id="ml-pick" className="w-full" value={picked} onChange={(e) => setPicked(e.target.value)} disabled={busy}>
                    <NativeSelectOption value="">Select an airport…</NativeSelectOption>
                    {addOptions.map((o) => (
                      <NativeSelectOption key={o.value} value={o.value}>
                        {o.label}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                )}
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ml-name">{nameLabel}</Label>
                  <Input
                    id="ml-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={nameLabel}
                    autoComplete="off"
                    disabled={busy}
                  />
                </div>
                {showSecondaryField && (
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="ml-secondary">
                      {secondaryLabel}
                      {secondaryRequired ? '' : ' (optional)'}
                    </Label>
                    <Input
                      id="ml-secondary"
                      value={secondary}
                      onChange={(e) => setSecondary(e.target.value)}
                      placeholder={secondaryLabel}
                      autoComplete="off"
                      disabled={busy}
                    />
                  </div>
                )}
              </div>
            )}
            {error && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditState({ mode: 'create' })}
                disabled={busy || editState.mode !== 'edit'}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  busy ||
                  (editState.mode === 'create' && addOptions
                    ? picked === ''
                    : name.trim() === '' || (secondaryRequired && secondary.trim() === ''))
                }
              >
                {editState.mode === 'edit' ? (busy ? 'Saving…' : 'Save changes') : busy ? 'Adding…' : addLabel}
              </Button>
            </div>
          </form>

          <div className="flex flex-col divide-y rounded-lg border">
            {sortedItems.length === 0 ? (
              <p className="m-0 p-4 text-center text-sm text-muted-foreground">{emptyMessage}</p>
            ) : (
              sortedItems.map((it) => (
                <div key={it.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="m-0 text-sm font-semibold">{it.name}</p>
                    {it.secondary != null && it.secondary !== '' && <p className="m-0 text-xs text-muted-foreground">{it.secondary}</p>}
                    {it.hint && <p className="m-0 text-xs text-destructive">{it.hint}</p>}
                  </div>
                  <KebabMenu
                    label={`Actions for ${it.name}`}
                    actions={[
                      {
                        label: 'Edit',
                        onSelect: () =>
                          setEditState({ mode: 'edit', id: it.id, initial: { name: it.name, secondary: it.secondary ?? '' } }),
                      },
                      ...(it.isProtected
                        ? []
                        : [
                            {
                              label: 'Remove',
                              onSelect: () => {
                                setDeleteError(null)
                                setDeleting(it)
                              },
                              destructive: true,
                            },
                          ]),
                    ]}
                  />
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {deleting && (
        <ConfirmDeleteDialog
          product={{ id: deleting.id, name: deleting.name } as never}
          busy={deleteBusy}
          errorMessage={deleteError}
          description="This removes it from the list."
          onClose={() => {
            if (deleteBusy) return
            setDeleting(null)
            setDeleteError(null)
          }}
          onConfirm={() => void handleDelete()}
        />
      )}
    </>
  )
}

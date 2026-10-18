// Small CRUD dialog used to manage a list of named items (warehouses,
// suppliers). Header + a top-of-dialog add form, then a list of rows
// each with a kebab menu (Edit / Delete). Reuses KebabMenu,
// ConfirmDeleteDialog, useDialogFocusTrap and the shared navy styling.

import { useId, useMemo, useRef, useState, type FormEvent } from 'react'
import { useDialogFocusTrap } from '../catalog/useDialogFocusTrap'
import { KebabMenu } from '../catalog/KebabMenu'
import { ConfirmDeleteDialog } from '../catalog/ConfirmDeleteDialog'
import styles from './ManageListDialog.module.css'

export interface ManageListItem {
  id: string
  name: string
  secondary?: string
  /** When true, the item cannot be deleted through the dialog. */
  isProtected?: boolean
  /** Optional helper text shown under the name in the row. */
  hint?: string
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
    items,
    emptyMessage,
    addLabel,
    busy,
    onClose,
    onCreate,
    onUpdate,
    onDelete,
  } = props

  const dialogRef = useRef<HTMLDivElement | null>(null)
  const headingId = useId()
  useDialogFocusTrap(true, dialogRef, onClose)

  type EditState = { mode: 'closed' } | { mode: 'create' } | { mode: 'edit'; id: string; initial: ManageListInput }
  const [editState, setEditStateRaw] = useState<EditState>({ mode: 'closed' })
  const [name, setName] = useState('')
  const [secondary, setSecondary] = useState('')
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
      setEditState({ mode: 'closed' })
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
    <div className={styles.backdrop} onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div ref={dialogRef} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby={headingId}>
        <header className={styles.header}>
          <div>
            <h2 id={headingId} className={styles.title}>
              {title}
            </h2>
            <p className={styles.subtitle}>{subtitle}</p>
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close" disabled={busy}>
            ×
          </button>
        </header>

        <form className={styles.form} onSubmit={onSubmit} noValidate>
          <div className={styles.row}>
            <div className={styles.field}>
              <label htmlFor="ml-name" className={styles.label}>
                {nameLabel}
              </label>
              <input
                id="ml-name"
                type="text"
                className={styles.input}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={nameLabel}
                autoComplete="off"
                disabled={busy}
              />
            </div>
            {showSecondaryField && (
              <div className={styles.field}>
                <label htmlFor="ml-secondary" className={styles.label}>
                  {secondaryLabel}
                  {secondaryRequired ? '' : ' (optional)'}
                </label>
                <input
                  id="ml-secondary"
                  type="text"
                  className={styles.input}
                  value={secondary}
                  onChange={(e) => setSecondary(e.target.value)}
                  placeholder={secondaryLabel}
                  autoComplete="off"
                  disabled={busy}
                />
              </div>
            )}
          </div>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          <div className={styles.formFooter}>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => setEditState({ mode: 'closed' })}
              disabled={busy || editState.mode === 'closed'}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={styles.primaryButton}
              disabled={busy || name.trim() === '' || (secondaryRequired && secondary.trim() === '')}
            >
              {editState.mode === 'edit' ? (busy ? 'Saving…' : 'Save changes') : busy ? 'Adding…' : addLabel}
            </button>
          </div>
        </form>

        <div className={styles.list}>
          {sortedItems.length === 0 ? (
            <p className={styles.empty}>{emptyMessage}</p>
          ) : (
            sortedItems.map((it) => (
              <div key={it.id} className={styles.listRow}>
                <div className={styles.itemBody}>
                  <p className={styles.itemName}>{it.name}</p>
                  {it.secondary != null && it.secondary !== '' && <p className={styles.itemSecondary}>{it.secondary}</p>}
                  {it.hint && <p className={styles.itemHint}>{it.hint}</p>}
                </div>
                <KebabMenu
                  label={`Actions for ${it.name}`}
                  actions={[
                    {
                      label: 'Edit',
                      onSelect: () => setEditState({ mode: 'edit', id: it.id, initial: { name: it.name, secondary: it.secondary ?? '' } }),
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
      </div>

      {deleting && (
        <ConfirmDeleteDialog
          product={{ id: deleting.id, name: deleting.name } as never}
          busy={deleteBusy}
          errorMessage={deleteError}
          onClose={() => {
            if (deleteBusy) return
            setDeleting(null)
            setDeleteError(null)
          }}
          onConfirm={() => void handleDelete()}
        />
      )}
    </div>
  )
}

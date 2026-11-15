import { useCallback, useEffect, useId, useRef, type ReactNode } from 'react'
import styles from './Dialog.module.css'
import '../styles/tokens.css'

interface DialogProps {
  open: boolean
  title: string
  description?: string
  onClose: () => void
  children?: ReactNode
  footer?: ReactNode
  /**
   * Called with the dialog element, so a popup inside the dialog can be rendered into it. A popup portalled to the body
   * is painted under the dialog, because the dialog sits in the browser's top layer.
   */
  dialogRef?: (dialog: HTMLDialogElement | null) => void
}

export function Dialog({ open, title, description, onClose, children, footer, dialogRef }: DialogProps) {
  const dialogRefInternal = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const descriptionId = useId()

  /* The callback is stable, so the element is not handed over again on every render. */
  const setDialog = useCallback(
    (dialog: HTMLDialogElement | null) => {
      dialogRefInternal.current = dialog
      dialogRef?.(dialog)
    },
    [dialogRef],
  )

  useEffect(() => {
    const dialog = dialogRefInternal.current
    if (!dialog) {
      return
    }
    if (open && !dialog.open) {
      dialog.showModal()
    }
    if (!open && dialog.open) {
      dialog.close()
    }

    return () => {
      if (dialog.open) {
        dialog.close()
      }
    }
  }, [open])

  useEffect(() => {
    const dialog = dialogRefInternal.current
    if (!dialog) {
      return
    }

    const handleCancel = (event: Event) => {
      event.preventDefault()
      onClose()
    }

    dialog.addEventListener('cancel', handleCancel)
    return () => dialog.removeEventListener('cancel', handleCancel)
  }, [onClose])

  return (
    <dialog
      ref={setDialog}
      className={styles.dialog}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <div className={styles.panel}>
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
        {description ? (
          <p id={descriptionId} className={styles.description}>
            {description}
          </p>
        ) : null}
        {children}
        {footer ? <div className={styles.footer}>{footer}</div> : null}
      </div>
    </dialog>
  )
}

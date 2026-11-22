import type { ReactNode } from 'react'
import {
  Dialog as DialogRoot,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@customer-web/components/ui/dialog'

interface DialogProps {
  open: boolean
  title: string
  description?: string
  onClose: () => void
  children?: ReactNode
  footer?: ReactNode
  /**
   * Called with the dialog's content element, so a popup inside the dialog (a calendar) can be rendered into it and
   * stays above the dialog and inside its focus trap.
   */
  dialogRef?: (dialog: HTMLElement | null) => void
}

/** The booking pages' modal: the app's shadcn Dialog with a title, an optional description and a footer of actions. */
export function Dialog({ open, title, description, onClose, children, footer, dialogRef }: DialogProps) {
  return (
    <DialogRoot open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      {/* Without a description Radix needs aria-describedby set to undefined explicitly, or it warns. */}
      <DialogContent
        ref={dialogRef}
        className="text-left sm:max-w-lg [&>*]:min-w-0"
        {...(description ? {} : { 'aria-describedby': undefined })}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {children}
        {footer ? <DialogFooter className="sm:flex-wrap">{footer}</DialogFooter> : null}
      </DialogContent>
    </DialogRoot>
  )
}

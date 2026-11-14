import type { FormEvent, ReactNode } from 'react'
import { Button } from '@staff-web/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@staff-web/components/ui/dialog'
import { ErrorMessage } from './StateMessage'

interface FormDialogProps {
  title: string
  /** An error from the action taken in this dialog, shown above the form. */
  error?: string | null
  isSubmitting: boolean
  submitLabel: string
  submittingLabel: string
  onClose: () => void
  onSubmit: (event: FormEvent) => void
  children: ReactNode
}

/** A modal form: the shadcn `Dialog` with a title, an error slot, the fields, and Cancel / submit buttons. */
export function FormDialog({ title, error, isSubmitting, submitLabel, submittingLabel, onClose, onSubmit, children }: FormDialogProps) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-label={title} aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="font-sans text-lg leading-none font-semibold text-foreground">{title}</DialogTitle>
        </DialogHeader>
        {error && <ErrorMessage message={error} />}
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          {children}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? submittingLabel : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

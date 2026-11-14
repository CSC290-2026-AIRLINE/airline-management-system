import type { ReactNode } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@customer-web/components/ui/dialog'
import { cn } from '@customer-web/lib/utils'

/**
 * Modal shell for the profile dialogs. `suspended` hides the dialog without losing the caller's state, so a third-party
 * modal (Clerk's session reverification) can take over focus.
 */
export default function ProfileDialog({
  title,
  onClose,
  children,
  className,
  steps,
  suspended = false,
}: {
  title: ReactNode
  onClose: () => void
  children: ReactNode
  className?: string
  steps?: ReactNode
  suspended?: boolean
}) {
  return (
    <Dialog
      open={!suspended}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent aria-describedby={undefined} className={cn('max-h-[90svh] overflow-y-auto text-left', className)}>
        {steps}
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  )
}

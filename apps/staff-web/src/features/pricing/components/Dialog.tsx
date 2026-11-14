import type { ReactNode } from 'react'
import { Dialog as ShadcnDialog, DialogContent, DialogDescription } from '@staff-web/components/ui/dialog'

interface DialogProps {
  onClose: () => void
  children: ReactNode
}

/** A shadcn Dialog that is open while mounted: mount it to open, unmount to close. Esc and the backdrop call `onClose`. */
export function Dialog({ onClose, children }: DialogProps) {
  return (
    <ShadcnDialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="pr-dialog max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogDescription className="sr-only">Dialog</DialogDescription>
        {children}
      </DialogContent>
    </ShadcnDialog>
  )
}

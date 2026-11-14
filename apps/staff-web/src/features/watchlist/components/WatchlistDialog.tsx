import type { ReactNode } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@staff-web/components/ui/dialog'

/** A shadcn `Dialog` that is always open while mounted; `onClose` is called for Escape, the close button and outside clicks. */
export function WatchlistDialog({
  title,
  description,
  children,
  onClose,
  compact = false,
}: {
  title: string
  description?: string
  children: ReactNode
  onClose: () => void
  compact?: boolean
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={compact ? 'text-foreground sm:max-w-md' : 'max-h-[90dvh] overflow-y-auto text-foreground sm:max-w-2xl'}>
        <DialogHeader>
          <DialogTitle className="text-foreground">{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : (
            <DialogDescription className="sr-only">{title}</DialogDescription>
          )}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  )
}

import { useRef, type ReactNode } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@staff-web/components/ui/dialog'
import { cn } from '@staff-web/lib/utils'

/**
 * Centred pop-up (shadcn `Dialog`). Escape and a click outside both cancel, unless `busy` (a request is in flight).
 * Fonts are set again here because the dialog is portalled outside the admin shell.
 *
 * This is a copy of the shell `StaffRolesPage.tsx` keeps for itself. That page belongs to another team member, so
 * moving its copy into a shared file would edit their file; this one serves the Role access dialogs instead. If the
 * two ever disagree about the shell, fold them into one then.
 */
export function Modal({
  title,
  onClose,
  busy = false,
  focusContent = false,
  className,
  children,
}: {
  /** The dialog's accessible name; the visible heading is part of `children`. */
  title: string
  onClose: () => void
  busy?: boolean
  /** Focus the dialog itself on open rather than its first control (the × button). */
  focusContent?: boolean
  className?: string
  children: ReactNode
}) {
  const contentRef = useRef<HTMLDivElement>(null)
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose()
      }}
    >
      <DialogContent
        ref={contentRef}
        showCloseButton={false}
        onOpenAutoFocus={(e) => {
          if (!focusContent) return
          e.preventDefault()
          contentRef.current?.focus()
        }}
        aria-describedby={undefined}
        className={cn('overflow-y-auto border-0 bg-background p-0 font-sans text-foreground sm:', className)}
        onInteractOutside={(e) => {
          if (busy) e.preventDefault()
        }}
        onEscapeKeyDown={(e) => {
          if (busy) e.preventDefault()
        }}
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        {children}
      </DialogContent>
    </Dialog>
  )
}

import type { ReactNode } from 'react'
import { Label } from '@staff-web/components/ui/label'
import { cn } from '@staff-web/lib/utils'

/**
 * The small form pieces the Role access dialogs use: a labelled field, a hint under it, and the red box for a failure
 * that belongs to the dialog rather than to one field.
 *
 * These mirror the ones `StaffRolesPage.tsx` keeps for itself. That page belongs to another team member, so its copies
 * stay where they are; these are the Role access copies.
 */
export function Field({ label, htmlFor, error, children }: { label: ReactNode; htmlFor: string; error?: boolean; children: ReactNode }) {
  return (
    <div className="mb-4 flex flex-col gap-1 max-phone:mb-3 max-phone:gap-1.5">
      <Label
        htmlFor={htmlFor}
        className={cn('mb-0.5 text-muted-foreground max-phone:mb-0 max-phone:uppercase', error && 'max-phone:text-danger')}
      >
        {label}
      </Label>
      {children}
    </div>
  )
}

export function Hint({ error, children }: { error?: boolean; children: ReactNode }) {
  return (
    <p className={cn('mt-0.5 text-xs leading-tight text-muted-foreground max-phone:mt-0 max-phone:text-xs', error && 'text-danger')}>
      {children}
    </p>
  )
}

/** A dialog-level error: title + message + the backend code, shown in the red box above the buttons. */
export interface BoxError {
  title: string
  message: string
  code: string
}

export function ErrorBox({ error }: { error: BoxError }) {
  return (
    <div className="mb-2 flex flex-col gap-1 rounded-lg border border-danger-line bg-danger-soft px-3.5 py-3 text-danger" role="alert">
      <strong className="text-sm font-bold">{error.title}</strong>
      <span className="text-xs leading-snug">{error.message}</span>
    </div>
  )
}

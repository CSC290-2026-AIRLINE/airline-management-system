import type { ReactNode } from 'react'
import { Label } from '@staff-web/components/ui/label'

/** A shadcn `Label` over one control. Pass the control's `id` as `htmlFor`. */
export function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  )
}

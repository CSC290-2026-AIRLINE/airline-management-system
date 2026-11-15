import type { ReactNode } from 'react'
import { Alert, AlertDescription } from '@staff-web/components/ui/alert'
import { cn } from '@staff-web/lib/utils'

const TONES = {
  info: 'border-sky-200 bg-sky-50 text-sky-900',
  warn: 'border-amber-200 bg-amber-50 text-amber-900',
  crit: 'border-red-200 bg-red-50 text-red-800',
  good: 'border-emerald-200 bg-emerald-50 text-emerald-900',
}

// A tinted message on the shadcn Alert. `action` is a link or button set apart on the right.
export function Callout({ tone, children, action }: { tone: keyof typeof TONES; children: ReactNode; action?: ReactNode }) {
  return (
    <Alert className={cn('my-4', TONES[tone])}>
      <AlertDescription className="flex flex-wrap items-center justify-between gap-3 text-inherit">
        <span>{children}</span>
        {action}
      </AlertDescription>
    </Alert>
  )
}

import type { ReactNode } from 'react'
import { Badge as UiBadge } from '@staff-web/components/ui/badge'
import { cn } from '@staff-web/lib/utils'

/** Tone names come from the screening model: statuses (Held…), match levels (Strong…) and comparisons (Same…). */
const tones: Record<string, string> = {
  held: 'bg-amber-100 text-amber-800',
  probable: 'bg-amber-100 text-amber-800',
  similar: 'bg-amber-100 text-amber-800',
  strong: 'bg-red-100 text-red-800',
  confirmed: 'bg-red-100 text-red-800',
  different: 'bg-red-100 text-red-800',
  released: 'bg-emerald-100 text-emerald-800',
  same: 'bg-emerald-100 text-emerald-800',
}

export function Badge({ children, tone }: { children: ReactNode; tone: string }) {
  return (
    <UiBadge variant="secondary" className={cn(tones[tone.toLowerCase()])}>
      {children}
    </UiBadge>
  )
}

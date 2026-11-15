import type { ReactNode } from 'react'
import { cn } from '@staff-web/lib/utils'

// Rounded border around a shadcn Table. `spaced` adds the gap under a heading.
export function TableWrap({ spaced = false, children }: { spaced?: boolean; children: ReactNode }) {
  return <div className={cn('overflow-hidden rounded-lg border', spaced && 'mt-4')}>{children}</div>
}

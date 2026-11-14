import type { ReactNode } from 'react'
import { cn } from '@customer-web/lib/utils'

/** Page frame shared by every account screen: a centered content column below. */
export default function AccountPage({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <main className="flex-1 bg-muted/40 text-left">
      <div className={cn('mx-auto w-full max-w-3xl space-y-6 px-4 py-6 md:py-10', className)}>{children}</div>
    </main>
  )
}

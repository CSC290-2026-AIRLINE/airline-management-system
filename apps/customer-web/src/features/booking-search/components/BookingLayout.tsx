import type { ReactNode } from 'react'

/**
 * The page frame of the booking pages, the same as the account pages': a muted canvas under the shared header. Each
 * page centres its own column. The class name lets index.css give #root its full width.
 */
export function BookingLayout({ children }: { children: ReactNode }) {
  return <div className="f3-customer-layout flex flex-1 flex-col bg-muted/40 text-left text-sm">{children}</div>
}

import type { ReactNode } from 'react'

// "Nothing here" box for lists that are filtered or built in the page itself; list pages that load from the API use ListState instead.
export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="fs-empty">{children}</div>
}

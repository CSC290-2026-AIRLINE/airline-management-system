import type { ReactNode } from 'react'
import '../styles/shell.css'

/**
 * The page column of the F6 staff screens. The sidebar is the global one (`AppShell`), provided by the `/check-in`
 * layout route. Printing a pass or a bag tag drops the page padding, so the sheet starts at the paper's edge.
 */
export function CheckInLayout({ children }: { children: ReactNode }) {
  return <div className="f6-page mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8 print:p-0">{children}</div>
}

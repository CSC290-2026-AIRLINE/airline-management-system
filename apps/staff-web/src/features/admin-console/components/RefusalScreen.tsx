import type { ReactNode } from 'react'
import { TopBar } from './TopBar'
import './RefusalScreen.css'

/**
 * The page frame a refusal screen renders in: the "Airlines" bar, then the card on the workspace's grey.
 *
 * Both refusal states appear outside the admin shell — the gate sits above `AdminShell` in
 * `routes/_authenticated/admin/route.tsx`, so a refused user gets no sidebar, and by the same token no "ADMINISTRATION"
 * header and no tab bar. They are also not somewhere they can navigate away from, which is the point: there is nothing
 * on the page for them to click except the card's one action.
 *
 * Wrapping it here rather than in each card keeps the two cards free of page furniture, so the same component works
 * unchanged on the design-preview route.
 */
export function RefusalScreen({ children }: { children: ReactNode }) {
  return (
    <div className="refusal-screen">
      <TopBar />
      {children}
    </div>
  )
}

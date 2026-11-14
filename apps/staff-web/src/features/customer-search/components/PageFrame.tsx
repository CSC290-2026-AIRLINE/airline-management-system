import type { ReactNode } from 'react'

/**
 * The Customer Search content frame. The staff navigation (sidebar, phone top bar, sign out) comes from the platform's
 * `AppShell`, which the route renders around this page.
 */
export function PageFrame({ children }: { children: ReactNode }) {
  return <div className="flex w-full max-w-6xl flex-col gap-4 px-6 pt-6 pb-10 min-[1100px]:px-[63px]">{children}</div>
}

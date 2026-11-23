import type { ReactNode } from 'react'
import { BaggageDeskContext, useBaggageDesk } from './hooks/useBaggageDesk'

/**
 * The page column of the Feature 10 staff screens. The sidebar is the global one (`AppShell`), provided by the `/baggage`
 * layout route, like every other workspace. The desk (simulation clock and the caller's role) is read once here and
 * shared with the pages.
 */
export function BaggageLayout({ children }: { children: ReactNode }) {
  const desk = useBaggageDesk()

  return (
    <BaggageDeskContext.Provider value={desk}>
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-4 tracking-normal text-foreground md:p-6 lg:p-8">
        {children}
      </div>
    </BaggageDeskContext.Provider>
  )
}

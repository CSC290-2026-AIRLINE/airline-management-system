import type { ReactNode } from 'react'
import { PageHeader } from './PageHeader'
import { SectionTabs } from './SectionTabs'
import { StaffShell } from './StaffShell'

// The frame of an area with tabs (Airports, Routes, Schedule flight): the shell, a fixed title, its main button and the tab strip are rendered
// once, so moving between tabs only swaps the body under them and nothing above it shifts.
export function SectionPage({
  section,
  title,
  action,
  children,
}: {
  section: 'airports' | 'routes' | 'board'
  title: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <StaffShell>
      <main className="fs-page">
        <PageHeader title={title} action={action} />
        <SectionTabs section={section} />
        {children}
      </main>
    </StaffShell>
  )
}

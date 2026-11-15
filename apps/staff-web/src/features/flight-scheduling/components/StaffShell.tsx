import { useRef, type ReactNode } from 'react'
import { Toaster } from '@staff-web/components/ui/sonner'
import { AppShell } from '@staff-web/features/admin-console/AppShell'
import { RequireStaff } from '@staff-web/features/admin-console/components/RequireStaff'
import { useTableLabels } from '../hooks/useTableLabels'
import { TopBar } from './TopBar'

// Every Feature 2 page sits inside the global staff frame (the main sidebar, whose "Flight Scheduling" group links these pages).
// `fs-shell` stays as a wrapper only because it carries the Feature 2 design tokens; it adds no layout of its own here.
export function StaffShell({ children }: { children: ReactNode }) {
  const content = useRef<HTMLDivElement>(null)
  useTableLabels(content)

  return (
    <RequireStaff>
      <AppShell>
        <div className="fs-shell fs-embedded">
          <div className="fs-content" ref={content}>
            <TopBar />
            {children}
            <Toaster />
          </div>
        </div>
      </AppShell>
    </RequireStaff>
  )
}

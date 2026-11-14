import type { ReactNode } from 'react'
import { AppShell } from '@staff-web/features/admin-console/AppShell'
import { RequireStaff } from '@staff-web/features/admin-console/components/RequireStaff'
import '../aircraft-management.css'

interface StaffShellProps {
  title: string
  description: string
  children: ReactNode
}

export function StaffShell({ title, description, children }: StaffShellProps) {
  return (
    <RequireStaff>
      <AppShell>
        <div className="f9-root">
          <main className="f9-main">
            <div className="f9-content">
              <header className="f9-header">
                <h1 className="f9-title">{title}</h1>
                <p className="f9-subtitle">{description}</p>
              </header>

              {children}
            </div>
          </main>
        </div>
      </AppShell>
    </RequireStaff>
  )
}

import { useEffect } from 'react'
import { Outlet } from '@tanstack/react-router'
import { useAppAuth } from '@staff-web/auth/AuthProvider'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@staff-web/components/ui/sidebar'
import { useMyAccess } from '@staff-web/features/admin-console/components/MyAccessProvider'
import { CargoSidebar } from './CargoSidebar'
import flythonMark from '@staff-web/features/admin-console/assets/flython-mark.svg'

export function CargoShell() {
  const { logout } = useAppAuth()
  const { role } = useMyAccess()
  const roleName = role?.name ?? 'Staff member'

  useEffect(() => {
    const root = document.getElementById('root')
    if (!root) return
    const prev = { width: root.style.width, maxWidth: root.style.maxWidth, borderInline: root.style.borderInline }
    root.style.width = '100%'
    root.style.maxWidth = '100%'
    root.style.borderInline = 'none'
    return () => {
      root.style.width = prev.width
      root.style.maxWidth = prev.maxWidth
      root.style.borderInline = prev.borderInline
    }
  }, [])

  return (
    <SidebarProvider className="bg-page font-sans text-left text-foreground [color-scheme:light]">
      <CargoSidebar roleName={roleName} onSignOut={() => void logout()} />
      <SidebarInset className="min-w-0 bg-page">
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 bg-sidebar px-4 text-sidebar-foreground md:hidden">
          <SidebarTrigger aria-label="Open cargo navigation" />
          <img src={flythonMark} alt="" className="h-5 w-auto" />
          <span className="font-heading font-bold">Flython</span>
        </header>

        <div className="flex w-full max-w-6xl flex-1 flex-col gap-4 p-4 md:p-6 lg:p-8">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

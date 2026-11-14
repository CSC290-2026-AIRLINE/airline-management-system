import { Link, useRouterState } from '@tanstack/react-router'
import { LogOut, Package, Plane, ShieldAlert, Settings, type LucideIcon } from 'lucide-react'
import { ScrollArea } from '@staff-web/components/ui/scroll-area'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@staff-web/components/ui/sidebar'
import flythonMark from '@staff-web/features/admin-console/assets/flython-logo-mark.svg'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
}

const CARGO_ITEMS: NavItem[] = [
  { to: '/cargo/bookings', label: 'Cargo desk', icon: Package },
  { to: '/cargo/flights', label: 'Flight cargo', icon: Plane },
  { to: '/cargo/claims', label: 'Claims', icon: ShieldAlert },
  { to: '/cargo/settings', label: 'Rates and settings', icon: Settings },
]

export function CargoSidebar({ roleName, onSignOut }: { roleName: string; onSignOut: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1">
          <img src={flythonMark} alt="" className="h-6 w-auto shrink-0" />
          <span className="flex flex-col font-heading leading-none font-bold group-data-[collapsible=icon]:hidden">
            <span className="text-xl">Flython</span>
            <span className="text-xs tracking-[0.3em]">AIRLINES</span>
          </span>
        </div>
        <p className="px-2 text-[0.65rem] font-semibold tracking-widest text-sidebar-foreground/70 uppercase group-data-[collapsible=icon]:hidden">
          Staff · Cargo
        </p>
      </SidebarHeader>

      <SidebarContent className="gap-0 overflow-hidden">
        <ScrollArea
          type="scroll"
          className="min-h-0 flex-1 [&_[data-slot=scroll-area-scrollbar]]:w-1.5 [&_[data-slot=scroll-area-thumb]]:bg-sidebar-foreground/30 [&_[data-slot=scroll-area-viewport]>div]:block!"
        >
          <SidebarGroup className="py-1">
            <SidebarGroupLabel className="text-xs font-semibold tracking-wide text-sidebar-foreground/70 uppercase">
              Cargo &amp; Air Freight
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="pl-4 group-data-[collapsible=icon]:pl-0">
                {CARGO_ITEMS.map((item) => {
                  const isActive = pathname === item.to || pathname.startsWith(item.to + '/')
                  const hasRoute =
                    item.to === '/cargo/settings' ||
                    item.to === '/cargo/bookings' ||
                    item.to === '/cargo/flights' ||
                    item.to === '/cargo/claims'
                  return (
                    <SidebarMenuItem key={item.to}>
                      {hasRoute ? (
                        <SidebarMenuButton asChild isActive={isActive} tooltip={item.label}>
                          <Link to={item.to}>
                            <item.icon />
                            <span>{item.label}</span>
                          </Link>
                        </SidebarMenuButton>
                      ) : (
                        <SidebarMenuButton disabled tooltip={item.label}>
                          <item.icon />
                          <span>{item.label}</span>
                        </SidebarMenuButton>
                      )}
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </ScrollArea>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="px-2 py-1 group-data-[collapsible=icon]:hidden">
              <p className="text-xs text-sidebar-foreground/70">Signed in as</p>
              <p className="text-sm font-medium">{roleName}</p>
            </div>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Sign out" onClick={onSignOut}>
              <LogOut />
              <span>Sign out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

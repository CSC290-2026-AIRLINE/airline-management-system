import type { CSSProperties, ReactNode } from 'react'
import { DoorOpen, ListChecks, LogOut, UserCheck, Users, type LucideIcon } from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '@staff-web/components/ui/sidebar'
import { formatClock } from '../domain/format.ts'
import type { StaffPage } from './shell-nav.ts'
import flythonMark from '../assets/flython-mark.svg'
import '../styles/shell.css'

/** The F6 staff screens, in sidebar order. */
const NAV_ITEMS: { page: StaffPage; label: string; icon: LucideIcon }[] = [
  { page: 'counter', label: 'Check-in counter', icon: UserCheck },
  { page: 'issues', label: 'Issue list', icon: ListChecks },
  { page: 'gate', label: 'Gate', icon: DoorOpen },
]

export interface StaffShellProps {
  current: StaffPage
  onNavigate: (page: StaffPage) => void
  agentName: string
  clock: Date
  onSignOut?: () => void
  children: ReactNode
}

/**
 * The staff workspace shell: the navy sidebar from the F6 design and the page column beside it.
 *
 * The sidebar is the shadcn `Sidebar`: on desktop it collapses to an icon rail, below 768px it becomes a sheet
 * opened from the top bar's trigger.
 */
export function StaffShell({ current, onNavigate, agentName, clock, onSignOut, children }: StaffShellProps) {
  return (
    <SidebarProvider
      className="f6-shell bg-page font-sans text-foreground [color-scheme:light]"
      /* The design's sidebar is 260 wide; the shadcn default is 14rem, which is 252px at this app's root font. */
      style={{ '--sidebar-width': '260px' } as CSSProperties}
    >
      {/* `border-r-0!` drops shadcn's 1px right border: the design's navy runs 260 wide straight into the page
          background, and that border would otherwise take 1px off the nav items and the footer cards. */}
      <Sidebar collapsible="icon" className="border-r-0! bg-sidebar print:hidden">
        <SidebarHeader className="gap-1 p-3">
          <div className="flex items-center gap-2">
            <img src={flythonMark} alt="" className="h-6 w-auto shrink-0" />
            <span className="flex flex-col font-heading leading-none font-bold group-data-[collapsible=icon]:hidden">
              <span className="text-xl">Flython</span>
              <span className="text-[10px] tracking-[0.3em]">AIRLINES</span>
            </span>
            <SidebarTrigger
              aria-label="Collapse navigation"
              className="ml-auto size-7 rounded-md border border-[#6e87b2]/80 bg-white/10 text-white hover:bg-white/15 hover:text-white"
            />
          </div>
          <p className="text-xs text-sidebar-foreground/70 group-data-[collapsible=icon]:hidden">STAFF · CHECK-IN &amp; GATE</p>
        </SidebarHeader>

        <SidebarContent className="gap-0 overflow-hidden">
          <SidebarGroup className="px-[22px] py-1">
            <SidebarGroupLabel className="h-6 px-0 text-[11px] font-semibold text-sidebar-foreground/70 group-data-[collapsible=icon]:hidden">
              CHECK-IN &amp; BOARDING
            </SidebarGroupLabel>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => (
                <SidebarMenuItem key={item.page}>
                  <SidebarMenuButton
                    isActive={current === item.page}
                    onClick={() => onNavigate(item.page)}
                    tooltip={item.label}
                    className="h-9 rounded-lg px-2.5 text-sm font-medium data-[active=true]:bg-white/12!"
                  >
                    <item.icon />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              <SidebarMenuItem>
                {/* Feature 7's page: listed, but not ours to open yet. */}
                <SidebarMenuButton disabled title="Feature 7" className="h-9 rounded-lg px-2.5 text-sm font-medium">
                  <Users />
                  <span>Customers</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        </SidebarContent>

        {/* The cards line up with the nav items: the same 22px gutter, 216 wide and 61 tall. */}
        <SidebarFooter className="gap-2 px-[22px] py-3">
          <div className="flex flex-col gap-1 rounded-[10px] border border-white/14 bg-white/6 px-3.5 py-3 group-data-[collapsible=icon]:hidden">
            <p className="text-[10.5px] leading-[13px] font-semibold text-white/65">SIMULATION CLOCK</p>
            <p className="flex items-center gap-2 text-[15px] leading-[18px] font-semibold text-white">
              <span className="size-[7px] shrink-0 rounded-full bg-[#faa61a]" />
              {formatClock(clock)}
            </p>
          </div>
          <div className="flex flex-col gap-1 rounded-[10px] border border-white/14 bg-white/6 px-3.5 py-3 group-data-[collapsible=icon]:hidden">
            <p className="text-[10.5px] leading-[13px] font-semibold text-white/65">SIGNED IN AS</p>
            <p className="flex items-center gap-2 text-[15px] leading-[18px] font-semibold text-white">
              <span className="size-[7px] shrink-0 rounded-full bg-[#4ade80]" />
              {agentName}
            </p>
          </div>
          <p className="text-xs text-white/65 group-data-[collapsible=icon]:hidden">
            Gate agent · BKK. Navigation follows assigned staff permissions.
          </p>
          {onSignOut ? (
            <button
              type="button"
              onClick={onSignOut}
              className="flex items-center gap-2 text-left text-sm font-medium text-white hover:text-white/80"
            >
              <LogOut className="size-4" />
              Sign out
            </button>
          ) : null}
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="min-w-0 bg-page">
        {/* Phone top bar: the sidebar is a sheet there, so this carries its trigger. */}
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 bg-sidebar px-4 text-sidebar-foreground md:hidden print:hidden">
          <SidebarTrigger aria-label="Open check-in navigation" />
          <img src={flythonMark} alt="" className="h-5 w-auto" />
          <span className="font-heading font-bold">Flython</span>
        </header>

        {/* The design's content column is 1054 wide; the page padding sits outside it, so the padded box is
            1054 + 2 × 32. Printing a pass or a bag tag: no page padding, so the sheet starts at the paper's edge. */}
        <div className="mx-auto w-full max-w-[1118px] p-8 print:p-0">
          <div className="flex w-full max-w-[1054px] flex-col gap-6">{children}</div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

import type { ReactNode } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import { ChevronRight, LogOut } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@staff-web/components/ui/collapsible'
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
  SidebarTrigger,
  useSidebar,
} from '@staff-web/components/ui/sidebar'
import flythonLogo from '../assets/flython-logo.svg'
import flythonLogoMark from '../assets/flython-logo-mark.svg'
import sidebarPattern from '../assets/sidebar-pattern.png'
import { groupKey, readOpen, writeOpen } from '../hooks/persisted-open'
import { ADMIN_ITEMS, GROUPS, PRICING_ITEMS, REPORTS_ITEM, type NavItem } from '../nav-items'

/**
 * These screens belong to other feature teams and have no routes in this app yet, so they are listed as disabled
 * buttons (dimmed, not focusable) instead of links that go nowhere. When a team registers its route, swap its entry for
 * a `<SidebarMenuButton asChild><Link/></SidebarMenuButton>`.
 */
// `indent` is for items inside a group: the padding sits on the button, so its hover block spans the full width.
function PendingItem({ item, indent = false }: { item: NavItem; indent?: boolean }) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton disabled className={indent ? 'pl-4' : undefined}>
        <item.icon />
        <span>{item.label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

/** A screen whose team has registered a route. A plain link, so the page swaps in without remounting the sidebar frame. */
function LinkedItem({
  item,
  pathname,
  indent = false,
}: {
  item: NavItem & { to: NonNullable<NavItem['to']> }
  pathname: string
  indent?: boolean
}) {
  const prefix = item.activePrefix ?? item.to
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={pathname === prefix || pathname.startsWith(prefix + '/')}
        tooltip={item.label}
        className={indent ? 'pl-4' : undefined}
      >
        <Link to={item.to} search={item.to === '/security-screening/screening-queue' ? { status: 'needs-review' } : undefined}>
          <item.icon />
          <span>{item.label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

/**
 * A sidebar group whose header opens and closes it. Closed = quiet and chevron right; open = bright and chevron down.
 * In the collapsed icon rail the header is hidden, a bar closes the group, and every item's icon shows, even in a closed group.
 */
function NavGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Collapsible
      defaultOpen={readOpen(groupKey(label), true)}
      onOpenChange={(open) => writeOpen(groupKey(label), open)}
      className="group/collapsible"
    >
      <SidebarGroup className="py-1">
        <SidebarGroupLabel asChild>
          <CollapsibleTrigger className="cursor-pointer text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[state=open]:font-semibold data-[state=open]:text-sidebar-foreground">
            {label}
            <ChevronRight className="ml-auto size-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90 motion-reduce:transition-none" />
          </CollapsibleTrigger>
        </SidebarGroupLabel>
        <CollapsibleContent className="group-data-[collapsible=icon]:block!">
          <SidebarGroupContent>
            <SidebarMenu>{children}</SidebarMenu>
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
      {/* Collapsed rail: a bar under the group, since its header is hidden. */}
      <div aria-hidden="true" className="mx-2 my-1 hidden h-px bg-sidebar-foreground/25 group-data-[collapsible=icon]:block" />
    </Collapsible>
  )
}

/**
 * The admin workspace sidebar: the shadcn `Sidebar` (icon-collapsible on desktop, a sheet on a phone). Administration
 * comes first — its three screens are the only live links — then the F15 menu of the other teams' screens.
 */
export function AppSidebar({ roleName, onSignOut }: { roleName: string; onSignOut: () => void }) {
  const { toggleSidebar } = useSidebar()
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  return (
    <Sidebar collapsible="icon">
      {/* The navy texture from the F15 frame, blended into the sidebar colour (its opacity is baked into the PNG). The sections below sit above it. */}
      <img
        src={sidebarPattern}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 size-full object-cover mix-blend-luminosity"
      />
      <SidebarHeader className="relative">
        <div className="flex items-center gap-2 px-2 py-1 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:px-0">
          <img src={flythonLogo} alt="Flython Airline" className="h-10 w-auto shrink-0 group-data-[collapsible=icon]:hidden" />
          <button
            type="button"
            aria-label="Expand sidebar"
            onClick={toggleSidebar}
            className="hidden size-8 shrink-0 cursor-pointer items-center justify-center rounded-md border border-white/25 bg-white/15 shadow-md ring-sidebar-ring transition-colors group-data-[collapsible=icon]:flex hover:bg-white/25 focus-visible:ring-2"
          >
            <img src={flythonLogoMark} alt="" className="h-auto w-6" />
          </button>
          {/* Desktop collapse toggle (also Ctrl/Cmd+B). Collapsed, the logo below takes its place as the expand button. */}
          <SidebarTrigger aria-label="Collapse sidebar" className="ml-auto hidden md:inline-flex group-data-[collapsible=icon]:hidden" />
        </div>
        <p className="px-2 text-xs text-[#b7c1d1] uppercase group-data-[collapsible=icon]:hidden">Admin workspace</p>
      </SidebarHeader>

      <SidebarContent className="relative gap-0 overflow-hidden">
        {/* Thin overlay scrollbar that only shows while scrolling (Radix `type="scroll"`). Radix wraps the content in a
            `display: table` div, which breaks truncation, so it is made a block. */}
        <ScrollArea
          type="scroll"
          className="min-h-0 flex-1 [&_[data-slot=scroll-area-scrollbar]]:w-1.5 [&_[data-slot=scroll-area-thumb]]:bg-sidebar-foreground/30 [&_[data-slot=scroll-area-viewport]>div]:block!"
        >
          <NavGroup label="Administration">
            {ADMIN_ITEMS.map((item) => (
              <SidebarMenuItem key={item.to}>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === item.to || pathname.startsWith(item.to + '/')}
                  tooltip={item.label}
                  className="pl-4"
                >
                  <Link to={item.to}>
                    <item.icon />
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </NavGroup>

          <NavGroup label="Pricing & Fare Rules">
            {PRICING_ITEMS.map((item) => (
              <SidebarMenuItem key={item.to}>
                <SidebarMenuButton asChild isActive={pathname === item.to} tooltip={item.label} className="pl-4">
                  <Link to={item.to}>
                    <item.icon />
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </NavGroup>

          {GROUPS.map((group) => (
            <NavGroup key={group.label} label={group.label}>
              {group.items.map((item) =>
                item.to ? (
                  <LinkedItem key={item.label} item={{ ...item, to: item.to }} pathname={pathname} indent />
                ) : (
                  <PendingItem key={item.label} item={item} indent />
                ),
              )}
            </NavGroup>
          ))}
          <SidebarGroup className="py-1">
            <SidebarGroupContent>
              <SidebarMenu>
                <PendingItem item={REPORTS_ITEM} />
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </ScrollArea>
      </SidebarContent>

      <SidebarFooter className="relative border-t border-white/10 bg-sidebar">
        <SidebarMenu>
          <SidebarMenuItem>
            <div
              title="Menu shows the screens your role can open."
              className="flex items-center gap-2 rounded-md border border-white/14 bg-white/6 px-2.5 py-1.5 group-data-[collapsible=icon]:hidden"
            >
              <span className="size-[7px] shrink-0 rounded-full bg-emerald-400" aria-hidden="true" />
              <span className="text-xs text-white/65">Signed in as</span>
              <span className="truncate text-sm font-semibold text-white">{roleName}</span>
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
    </Sidebar>
  )
}

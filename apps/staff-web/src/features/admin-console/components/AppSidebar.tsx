import type { ReactNode } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import {
  Accessibility,
  Calendar,
  ChartColumn,
  CreditCard,
  KeyRound,
  Luggage,
  LogOut,
  MessageSquare,
  Minus,
  Monitor,
  Package,
  Plane,
  PlaneLanding,
  Plus,
  ScrollText,
  Search,
  ShieldCheck,
  Star,
  Tag,
  Ticket,
  User,
  UserCheck,
  UserPlus,
  Users,
  Utensils,
  type LucideIcon,
} from 'lucide-react'
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
  SidebarRail,
} from '@staff-web/components/ui/sidebar'
import flythonMark from '../assets/flython-mark.svg'

/** The routes this sidebar links to. Every one of them is registered in the router. */
type NavRoute = '/booking-lookup' | '/book-for-customer' | '/assistance' | '/admin/staff' | '/admin/roles' | '/admin/audit-log'

interface NavItem {
  label: string
  icon: LucideIcon
  /** Set when the screen has a route in this app: the item is then a live link. */
  to?: NavRoute
}

const REPORTS_ITEM: NavItem = { label: 'Reports & Analytics', icon: ChartColumn }

const GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Operations',
    items: [
      { label: 'Flight Operations', icon: Plane },
      { label: 'Fleet & Aircraft', icon: PlaneLanding },
      { label: 'Crew Scheduling', icon: Calendar },
      { label: 'My Roster', icon: User },
    ],
  },
  {
    label: 'Commercial',
    items: [
      { label: 'Bookings & Inventory', icon: Ticket },
      { label: 'Pricing & Fare Rules', icon: Tag },
      { label: 'Payments & Refunds', icon: CreditCard },
      { label: 'Cargo & Air Freight', icon: Package },
    ],
  },
  {
    label: 'Airport & Onboard',
    items: [
      { label: 'Check-in & Boarding', icon: UserCheck },
      { label: 'Gate Counter & Devices', icon: Monitor },
      { label: 'Baggage Tracking', icon: Luggage },
      { label: 'Onboard Products', icon: Utensils },
    ],
  },
  {
    label: 'Customer Management',
    items: [
      { label: 'Customer Search', icon: Search },
      { label: 'Bookings', icon: Ticket, to: '/booking-lookup' },
      { label: 'Book for Customer', icon: UserPlus, to: '/book-for-customer' },
      { label: 'Assistance Queue', icon: Accessibility, to: '/assistance' },
      { label: 'Security Screening', icon: ShieldCheck },
      { label: 'Service & Compensation', icon: MessageSquare },
      { label: 'Loyalty Programme', icon: Star },
    ],
  },
]

/** The three admin screens, one per tab of the admin page. These are the live links in this app. */
const ADMIN_ITEMS: NavItem[] = [
  { to: '/admin/staff', label: 'Staff & roles', icon: Users },
  { to: '/admin/roles', label: 'Role access', icon: KeyRound },
  { to: '/admin/audit-log', label: 'Audit log', icon: ScrollText },
]

/**
 * One row of the sidebar. An item with a `to` is a live link to a screen this app has; an item without one belongs to
 * another feature team and has no route here yet, so it is listed as a disabled button (dimmed, not focusable). When a
 * team registers its route, it gains a `to` and becomes a link.
 */
function NavEntry({ item, pathname }: { item: NavItem; pathname: string }) {
  if (!item.to) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton disabled>
          <item.icon />
          <span>{item.label}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    )
  }
  const active = pathname === item.to || pathname.startsWith(item.to + '/')
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
        <Link to={item.to}>
          <item.icon />
          <span>{item.label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

/**
 * A sidebar group whose header opens and closes it. The header shows a plus when the group is closed and a minus when it
 * is open, which is the affordance the F3 designs use.
 */
function NavGroup({ label, defaultOpen, children }: { label: string; defaultOpen: boolean; children: ReactNode }) {
  return (
    <Collapsible defaultOpen={defaultOpen} className="group/collapsible">
      <SidebarGroup className="py-1">
        <SidebarGroupLabel asChild>
          <CollapsibleTrigger className="cursor-pointer text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[state=open]:font-semibold data-[state=open]:text-sidebar-foreground">
            <Plus className="size-4 shrink-0 group-data-[state=open]/collapsible:hidden" />
            <Minus className="hidden size-4 shrink-0 group-data-[state=open]/collapsible:block" />
            {label}
          </CollapsibleTrigger>
        </SidebarGroupLabel>
        <CollapsibleContent>
          <SidebarGroupContent>
            <SidebarMenu className="pl-4 group-data-[collapsible=icon]:pl-0">{children}</SidebarMenu>
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  )
}

/**
 * The admin workspace sidebar: the shadcn `Sidebar` (icon-collapsible on desktop, a sheet on a phone). The menu follows
 * the F3 staff design — Reports & Analytics first, then the four feature groups, then Administration last.
 *
 * `expandedGroup` names the one group that starts open, for the pages whose design shows a single group expanded. The
 * admin console passes nothing and keeps every group open.
 */
export function AppSidebar({ roleName, onSignOut, expandedGroup }: { roleName: string; onSignOut: () => void; expandedGroup?: string }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const groupIsOpen = (label: string) => (expandedGroup === undefined ? true : label === expandedGroup)

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
        <p className="px-2 text-xs text-sidebar-foreground/70 group-data-[collapsible=icon]:hidden">Admin workspace</p>
      </SidebarHeader>

      <SidebarContent className="gap-0 overflow-hidden">
        {/* Thin overlay scrollbar that only shows while scrolling (Radix `type="scroll"`). Radix wraps the content in a
            `display: table` div, which breaks truncation, so it is made a block. */}
        <ScrollArea
          type="scroll"
          className="min-h-0 flex-1 [&_[data-slot=scroll-area-scrollbar]]:w-1.5 [&_[data-slot=scroll-area-thumb]]:bg-sidebar-foreground/30 [&_[data-slot=scroll-area-viewport]>div]:block!"
        >
          <SidebarGroup className="py-1">
            <SidebarGroupContent>
              <SidebarMenu>
                <NavEntry item={REPORTS_ITEM} pathname={pathname} />
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {GROUPS.map((group) => (
            <NavGroup key={group.label} label={group.label} defaultOpen={groupIsOpen(group.label)}>
              {group.items.map((item) => (
                <NavEntry key={item.label} item={item} pathname={pathname} />
              ))}
            </NavGroup>
          ))}

          <NavGroup label="Administration" defaultOpen={groupIsOpen('Administration')}>
            {ADMIN_ITEMS.map((item) => (
              <NavEntry key={item.to} item={item} pathname={pathname} />
            ))}
          </NavGroup>
        </ScrollArea>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="px-2 py-1 group-data-[collapsible=icon]:hidden">
              <p className="flex items-center gap-2 text-xs font-semibold tracking-wide text-sidebar-foreground/80 uppercase">
                <span className="size-2 rounded-full bg-[#2fa568]" />
                Signed in as
              </p>
              <p className="mt-1 text-sm font-bold">{roleName}</p>
            </div>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <p className="px-2 text-xs text-sidebar-foreground/70 group-data-[collapsible=icon]:hidden">
              Navigation follows assigned staff permissions.
            </p>
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

import type { ReactNode } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import {
  Calendar,
  ChartColumn,
  ChevronRight,
  CreditCard,
  KeyRound,
  Luggage,
  LogOut,
  MessageSquare,
  Monitor,
  Package,
  Plane,
  PlaneLanding,
  ScrollText,
  Search,
  ShieldCheck,
  Star,
  Tag,
  Ticket,
  User,
  UserCheck,
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

interface NavItem {
  label: string
  icon: LucideIcon
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
      { label: 'Security Screening', icon: ShieldCheck },
      { label: 'Service & Compensation', icon: MessageSquare },
      { label: 'Loyalty Programme', icon: Star },
    ],
  },
]

/** The three admin screens, one per tab of the admin page. These are the live links in this app. */
const ADMIN_ITEMS = [
  { to: '/admin/staff', label: 'Staff & roles', icon: Users },
  { to: '/admin/roles', label: 'Role access', icon: KeyRound },
  { to: '/admin/audit-log', label: 'Audit log', icon: ScrollText },
] as const

/**
 * These screens belong to other feature teams and have no routes in this app yet, so they are listed as disabled
 * buttons (dimmed, not focusable) instead of links that go nowhere. When a team registers its route, swap its entry for
 * a `<SidebarMenuButton asChild><Link/></SidebarMenuButton>`.
 */
function PendingItem({ item }: { item: NavItem }) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton disabled>
        <item.icon />
        <span>{item.label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

/** A sidebar group whose header opens and closes it. Closed = quiet and chevron right; open = bright and chevron down. */
function NavGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Collapsible defaultOpen className="group/collapsible">
      <SidebarGroup className="py-1">
        <SidebarGroupLabel asChild>
          <CollapsibleTrigger className="cursor-pointer text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[state=open]:font-semibold data-[state=open]:text-sidebar-foreground">
            {label}
            <ChevronRight className="ml-auto size-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90 motion-reduce:transition-none" />
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
 * The admin workspace sidebar: the shadcn `Sidebar` (icon-collapsible on desktop, a sheet on a phone). Administration
 * comes first — its three screens are the only live links — then the F15 menu of the other teams' screens.
 */
export function AppSidebar({ roleName, onSignOut }: { roleName: string; onSignOut: () => void }) {
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
        <p className="px-2 text-xs text-sidebar-foreground/70 group-data-[collapsible=icon]:hidden">Admin workspace</p>
      </SidebarHeader>

      <SidebarContent className="gap-0 overflow-hidden">
        {/* Thin overlay scrollbar that only shows while scrolling (Radix `type="scroll"`). Radix wraps the content in a
            `display: table` div, which breaks truncation, so it is made a block. */}
        <ScrollArea
          type="scroll"
          className="min-h-0 flex-1 [&_[data-slot=scroll-area-scrollbar]]:w-1.5 [&_[data-slot=scroll-area-thumb]]:bg-sidebar-foreground/30 [&_[data-slot=scroll-area-viewport]>div]:block!"
        >
          <NavGroup label="Administration">
            {ADMIN_ITEMS.map((item) => (
              <SidebarMenuItem key={item.to}>
                <SidebarMenuButton asChild isActive={pathname === item.to || pathname.startsWith(item.to + '/')} tooltip={item.label}>
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
              {group.items.map((item) => (
                <PendingItem key={item.label} item={item} />
              ))}
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

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="px-2 py-1 group-data-[collapsible=icon]:hidden">
              <p className="text-xs text-sidebar-foreground/70">Signed in as</p>
              <p className="text-sm font-medium">{roleName}</p>
              <p className="mt-1 text-xs text-sidebar-foreground/70">Menu shows the screens your role can open.</p>
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

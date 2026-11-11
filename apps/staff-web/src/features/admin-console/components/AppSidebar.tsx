import type { ReactNode } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import {
  Calendar,
  ChartColumn,
  ChevronRight,
  CreditCard,
  FileText,
  KeyRound,
  Luggage,
  LogOut,
  MessageSquare,
  Monitor,
  Package,
  Percent,
  Plane,
  PlaneLanding,
  Receipt,
  ScrollText,
  Search,
  ShieldCheck,
  SlidersHorizontal,
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
  SidebarTrigger,
  useSidebar,
} from '@staff-web/components/ui/sidebar'
import flythonMark from '../assets/flython-mark.svg'
import flythonLogoMark from '../assets/flython-logo-mark.svg'
import sidebarPattern from '../assets/sidebar-pattern.png'

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

/** The pricing and finance screens, one per page of the Pricing & Fare Rules feature. */
const PRICING_ITEMS = [
  { to: '/pricing/fare-setup', label: 'Fare Setup', icon: Tag },
  { to: '/pricing/pricing-rules', label: 'Pricing Rules', icon: SlidersHorizontal },
  { to: '/pricing/taxes-promos', label: 'Taxes, Currency & Promos', icon: Percent },
  { to: '/pricing/expenses-payments', label: 'Expenses & Payments', icon: Receipt },
  { to: '/pricing/monthly-report', label: 'Monthly Report', icon: FileText },
] as const

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

/**
 * A sidebar group whose header opens and closes it. Closed = quiet and chevron right; open = bright and chevron down.
 * In the collapsed icon rail the header is hidden, a bar closes the group, and every item's icon shows, even in a closed group.
 */
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
          <img src={flythonMark} alt="" className="h-6 w-auto shrink-0 group-data-[collapsible=icon]:hidden" />
          <button
            type="button"
            aria-label="Expand sidebar"
            onClick={toggleSidebar}
            className="hidden size-8 shrink-0 cursor-pointer items-center justify-center rounded-md border border-white/25 bg-white/15 shadow-md ring-sidebar-ring transition-colors group-data-[collapsible=icon]:flex hover:bg-white/25 focus-visible:ring-2"
          >
            <img src={flythonLogoMark} alt="" className="h-auto w-5" />
          </button>
          <span className="flex flex-col font-heading leading-none font-bold group-data-[collapsible=icon]:hidden">
            <span className="text-xl">Flython</span>
            <span className="text-xs tracking-[0.3em]">AIRLINES</span>
          </span>
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
              {group.items.map((item) => (
                <PendingItem key={item.label} item={item} indent />
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

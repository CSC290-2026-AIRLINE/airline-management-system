import {
  Calendar,
  CalendarClock,
  Globe,
  Gauge,
  ChartColumn,
  ClipboardCheck,
  CreditCard,
  DoorOpen,
  FileText,
  IdCard,
  KeyRound,
  ListChecks,
  Luggage,
  MessageSquare,
  Monitor,
  Package,
  Percent,
  PlaneLanding,
  PlaneTakeoff,
  Receipt,
  Route,
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

/** Sidebar contents, shared by the live sidebar and the Role access "Preview as user". `code` is the registered screen code. */

export interface NavItem {
  label: string
  icon: LucideIcon
  /** Set once the owning team has a route. Items without one stay disabled in the live sidebar. */
  to?: '/customer-search' | '/security-screening/screening-queue' | '/aircraft' | '/aircraft-types' | '/readiness'
  /** Path prefix that keeps the item highlighted on the feature's other pages. */
  activePrefix?: string
}

export const REPORTS_ITEM: NavItem = { label: 'Reports & Analytics', icon: ChartColumn }

export const GROUPS: { label: string; items: NavItem[] }[] = [
  // Groups with live links come first; the rest are disabled placeholders until their teams add routes.
  {
    label: 'Customer Management',
    items: [
      { label: 'Customer Search', icon: Search, to: '/customer-search', activePrefix: '/customer-search' },
      { label: 'Security Screening', icon: ShieldCheck, to: '/security-screening/screening-queue', activePrefix: '/security-screening' },
      { label: 'Service & Compensation', icon: MessageSquare },
      { label: 'Loyalty Programme', icon: Star },
    ],
  },
  {
    label: 'Operations',
    items: [
      { label: 'Fleet & Aircraft', icon: PlaneLanding, to: '/aircraft', activePrefix: '/aircraft' },
      { label: 'Aircraft Types', icon: PlaneTakeoff, to: '/aircraft-types', activePrefix: '/aircraft-types' },
      { label: 'Aircraft Readiness', icon: ClipboardCheck, to: '/readiness' },
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
      { label: 'Gate Counter & Devices', icon: Monitor },
      { label: 'Baggage Tracking', icon: Luggage },
      { label: 'Onboard Products', icon: Utensils },
    ],
  },
]

/** The three admin screens, one per tab of the admin page. These are the live links in this app. */
export const ADMIN_ITEMS = [
  { to: '/admin/staff', code: 'f15.staff_roles', label: 'Staff & roles', icon: Users },
  { to: '/admin/roles', code: 'f15.role_access', label: 'Role access', icon: KeyRound },
  { to: '/admin/audit-log', code: 'f15.audit_log', label: 'Audit log', icon: ScrollText },
] as const

/** The pricing and finance screens, one per page of the Pricing & Fare Rules feature. */
export const PRICING_ITEMS = [
  { to: '/pricing/fare-setup', code: 'f04.fare_setup', label: 'Fare Setup', icon: Tag },
  { to: '/pricing/pricing-rules', code: 'f04.pricing_rules', label: 'Pricing Rules', icon: SlidersHorizontal },
  { to: '/pricing/taxes-promos', code: 'f04.taxes_promos', label: 'Taxes, Currency & Promos', icon: Percent },
  { to: '/pricing/expenses-payments', code: 'f04.expenses_payments', label: 'Expenses & Payments', icon: Receipt },
  { to: '/pricing/monthly-report', code: 'f04.monthly_report', label: 'Monthly Report', icon: FileText },
] as const

/**
 * The crew rostering screens (Feature 8). `match` lists every path that lights the item up: "Roster runs" is one item
 * for the three wizard steps, and "Crew" covers each crew member's profile page.
 */
export const CREW_ITEMS = [
  {
    to: '/build-pairings',
    code: 'f08.roster_runs',
    label: 'Roster runs',
    icon: Route,
    match: ['/build-pairings', '/assign-crew', '/fix-publish'],
  },
  { to: '/setup-crew', code: 'f08.crew', label: 'Crew', icon: IdCard, match: ['/setup-crew'] },
  { to: '/setup-rule', code: 'f08.rules', label: 'Rules', icon: ListChecks, match: ['/setup-rule'] },
] as const

/** The check-in and gate screens of the Check-in & Boarding feature (F6). */
export const CHECKIN_ITEMS = [
  { to: '/check-in/counter', code: 'f06.counter', label: 'Check-in counter', icon: UserCheck },
  { to: '/check-in/issues', code: 'f06.issues', label: 'Issue list', icon: ListChecks },
  { to: '/check-in/gate', code: 'f06.gate', label: 'Gate', icon: DoorOpen },
] as const

/** The Feature 2 (flight scheduling and network operations) pages. `ownsPrefixes` keeps an item lit on its sub-pages, such as a flight's detail. */
export const FLIGHT_SCHEDULING_ITEMS: readonly {
  to: '/airports' | '/routes' | '/schedule-board' | '/congestion'
  label: string
  icon: LucideIcon
  ownsPrefixes?: readonly string[]
}[] = [
  { to: '/schedule-board', label: 'Schedule flight', icon: CalendarClock, ownsPrefixes: ['/flights', '/generate-flights'] },
  { to: '/airports', label: 'Airports', icon: Globe },
  { to: '/routes', label: 'Routes', icon: Route },
  { to: '/congestion', label: 'Congestion', icon: Gauge },
]

import {
  Accessibility,
  CalendarClock,
  ChartColumn,
  Globe,
  Gauge,
  ClipboardCheck,
  DoorOpen,
  FileText,
  GitCompareArrows,
  IdCard,
  Inbox,
  KeyRound,
  ListChecks,
  Luggage,
  MailCheck,
  Package,
  PackageSearch,
  Percent,
  Plane,
  PlaneLanding,
  PlaneTakeoff,
  Receipt,
  Route,
  ScrollText,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sofa,
  Star,
  Tag,
  Ticket,
  Truck,
  UserCheck,
  UserPlus,
  Users,
  Utensils,
  type LucideIcon,
} from 'lucide-react'

/** The routes this sidebar links to. Every one of them is registered in the router. */
export type NavRoute =
  | '/customer-search'
  | '/security-screening/screening-queue'
  | '/aircraft'
  | '/aircraft-types'
  | '/readiness'
  | '/booking-lookup'
  | '/book-for-customer'
  | '/assistance'
  // Feature 5 (Payments & Refunds), a top-level group in the sidebar.
  | '/payments/lookup'
  | '/payments/refunds'
  | '/payments/compensation'
  | '/payments/exceptions'
  | '/payments/pay-runs'
  | '/payments/my-pay'
  // Feature 14 (Business intelligence).
  | '/bi'

/** Sidebar contents, shared by the live sidebar and the Role access "Preview as user". `code` is the registered screen code. */
export interface NavItem {
  label: string
  icon: LucideIcon
  to: NavRoute
  /** Path prefix that keeps the item highlighted on the feature's other pages. */
  activePrefix?: string
}

/** Feature 14: the Business intelligence page (`/bi`), with its own tabs for each report. */
export const BI_ITEM: NavItem = { label: 'Business intelligence', icon: ChartColumn, to: '/bi', activePrefix: '/bi' }

export const GROUPS: { label: string; items: NavItem[] }[] = [
  // Only screens with a page behind them are listed. A team adds its group here when its routes exist.
  {
    label: 'Customer Management',
    items: [
      { label: 'Customer Search', icon: Search, to: '/customer-search', activePrefix: '/customer-search' },
      { label: 'Bookings', icon: Ticket, to: '/booking-lookup' },
      { label: 'Book for Customer', icon: UserPlus, to: '/book-for-customer' },
      { label: 'Assistance Queue', icon: Accessibility, to: '/assistance' },
      { label: 'Security Screening', icon: ShieldCheck, to: '/security-screening/screening-queue', activePrefix: '/security-screening' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { label: 'Fleet & Aircraft', icon: PlaneLanding, to: '/aircraft', activePrefix: '/aircraft' },
      { label: 'Aircraft Types', icon: PlaneTakeoff, to: '/aircraft-types', activePrefix: '/aircraft-types' },
      { label: 'Aircraft Readiness', icon: ClipboardCheck, to: '/readiness' },
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
 * for the three wizard steps and the published rosters they lead to, and "Crew" covers each crew member's profile page.
 */
export const CREW_ITEMS = [
  {
    to: '/build-pairings',
    code: 'f08.roster_runs',
    label: 'Roster runs',
    icon: Route,
    match: ['/build-pairings', '/assign-crew', '/fix-publish', '/published-rosters'],
  },
  { to: '/setup-crew', code: 'f08.crew', label: 'Crew', icon: IdCard, match: ['/setup-crew'] },
  { to: '/setup-rule', code: 'f08.rules', label: 'Rules', icon: ListChecks, match: ['/setup-rule'] },
] as const

/** The Feature 13 (customer service) staff pages: the complaint queue plus its reporting and notification screens. */
export const CUSTOMER_SERVICE_ITEMS = [
  { to: '/complaints', label: 'Complaint queue', icon: Inbox },
  { to: '/complaints/charts', label: 'Complaint charts', icon: ChartColumn },
  { to: '/complaints/delivery-log', label: 'Delivery log', icon: MailCheck },
  { to: '/complaints/templates', label: 'Templates', icon: FileText },
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

/** The Feature 10 (lost and found baggage) staff pages. */
export const BAGGAGE_ITEMS = [
  { to: '/baggage/lost-bag-cases', label: 'Lost bag cases', icon: Luggage },
  { to: '/baggage/found-bags', label: 'Found bags', icon: PackageSearch },
  { to: '/baggage/match-review', label: 'Match review', icon: GitCompareArrows },
  { to: '/baggage/deliveries', label: 'Deliveries', icon: Truck },
] as const

/** The Feature 11 (loyalty programme) staff pages. */
export const LOYALTY_ITEMS = [
  { to: '/loyalty/members', label: 'Member Lookup', icon: Search },
  { to: '/loyalty/rules', label: 'Loyalty Rules', icon: SlidersHorizontal },
  { to: '/loyalty/award-release', label: 'Award Release', icon: Star },
  { to: '/loyalty/lounge', label: 'Lounge Desk', icon: Sofa },
] as const

/** The Feature 17 (cargo and air freight) staff pages. */
export const CARGO_ITEMS = [
  { to: '/cargo/bookings', label: 'Cargo desk', icon: Package },
  { to: '/cargo/flights', label: 'Flight cargo', icon: Plane },
  { to: '/cargo/claims', label: 'Claims', icon: ShieldAlert },
  { to: '/cargo/settings', label: 'Rates and settings', icon: Settings },
] as const

/** The Feature 12 (onboard products) staff pages: catalog, menus, catering orders, warehouse stock and the flight report. */
export const CATERING_ITEMS = [
  { to: '/catering/catalog', label: 'Product Catalog', icon: Utensils },
  { to: '/catering/offered-menu', label: 'Offered Menu', icon: ListChecks },
  { to: '/catering/orders', label: 'Catering Orders', icon: ClipboardCheck },
  { to: '/catering/stock', label: 'Stock', icon: Package },
  { to: '/catering/flight-report', label: 'Flight Report', icon: FileText },
] as const

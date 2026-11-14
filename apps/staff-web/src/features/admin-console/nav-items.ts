import {
  ChartColumn,
  CreditCard,
  FileText,
  IdCard,
  KeyRound,
  ListChecks,
  Luggage,
  MessageSquare,
  Monitor,
  Package,
  Percent,
  Plane,
  PlaneLanding,
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
}

export const REPORTS_ITEM: NavItem = { label: 'Reports & Analytics', icon: ChartColumn }

export const GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Operations',
    items: [
      { label: 'Flight Operations', icon: Plane },
      { label: 'Fleet & Aircraft', icon: PlaneLanding },
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

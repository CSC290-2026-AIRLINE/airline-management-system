import {
  Banknote,
  Calendar,
  ChartColumn,
  ClipboardCheck,
  FileText,
  Gift,
  KeyRound,
  Luggage,
  MessageSquare,
  Monitor,
  Package,
  Percent,
  Plane,
  PlaneLanding,
  PlaneTakeoff,
  Receipt,
  ScrollText,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Star,
  Tag,
  Ticket,
  TriangleAlert,
  Undo2,
  User,
  UserCheck,
  Users,
  Utensils,
  Wallet,
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
      { label: 'Flight Operations', icon: Plane },
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

/** The Payments & Refunds screens (Feature 5), including crew pay (5c). */
export const PAYMENTS_ITEMS = [
  { to: '/payments/lookup', label: 'Payment Lookup', icon: Search },
  { to: '/payments/refunds', label: 'Refund Queue', icon: Undo2 },
  { to: '/payments/compensation', label: 'Compensation & Vouchers', icon: Gift },
  { to: '/payments/exceptions', label: 'Payment Exceptions', icon: TriangleAlert },
  { to: '/payments/pay-runs', label: 'Pay Runs', icon: Banknote },
  { to: '/payments/my-pay', label: 'My Pay', icon: Wallet },
] as const

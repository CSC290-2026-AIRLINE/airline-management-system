import {
  Calendar,
  ChartColumn,
  CreditCard,
  DoorOpen,
  FileText,
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

/** The check-in and gate screens of the Check-in & Boarding feature (F6). */
export const CHECKIN_ITEMS = [
  { to: '/check-in/counter', code: 'f06.counter', label: 'Check-in counter', icon: UserCheck },
  { to: '/check-in/issues', code: 'f06.issues', label: 'Issue list', icon: ListChecks },
  { to: '/check-in/gate', code: 'f06.gate', label: 'Gate', icon: DoorOpen },
] as const

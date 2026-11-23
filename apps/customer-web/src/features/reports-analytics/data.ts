import type { ReportPeriod } from './types'

/**
 * Chrome for the Reports & Analytics screen — the sidebar navigation, the tabs and the period selector.
 * The numbers themselves come from the API (see `types.ts`, `fixtures.ts` and the `hooks/` folder).
 */

export type NavIcon =
  | 'reports-analytics'
  | 'flight-operations'
  | 'fleet-aircraft'
  | 'crew-scheduling'
  | 'my-roster'
  | 'bookings-inventory'
  | 'pricing-fare-rules'
  | 'payments-refunds'
  | 'cargo-air-freight'
  | 'checkin-boarding'
  | 'gate-counter-devices'
  | 'baggage-tracking'
  | 'onboard-products'
  | 'customer-search'
  | 'security-screening'
  | 'service-compensation'
  | 'loyalty-programme'
  | 'administration'

export interface NavItem {
  label: string
  icon: NavIcon
}

export interface NavGroup {
  title: string
  items: NavItem[]
}

/** Sidebar navigation, in the order the design lists it. */
export const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Operations',
    items: [
      { label: 'Flight Operations', icon: 'flight-operations' },
      { label: 'Fleet & Aircraft', icon: 'fleet-aircraft' },
      { label: 'Crew Scheduling', icon: 'crew-scheduling' },
      { label: 'My Roster', icon: 'my-roster' },
    ],
  },
  {
    title: 'Commercial',
    items: [
      { label: 'Bookings & Inventory', icon: 'bookings-inventory' },
      { label: 'Pricing & Fare Rules', icon: 'pricing-fare-rules' },
      { label: 'Payments & Refunds', icon: 'payments-refunds' },
      { label: 'Cargo & Air Freight', icon: 'cargo-air-freight' },
    ],
  },
  {
    title: 'Airport & Onboard',
    items: [
      { label: 'Check-in & Boarding', icon: 'checkin-boarding' },
      { label: 'Gate Counter & Devices', icon: 'gate-counter-devices' },
      { label: 'Baggage Tracking', icon: 'baggage-tracking' },
      { label: 'Onboard Products', icon: 'onboard-products' },
    ],
  },
  {
    title: 'Customer Management',
    items: [
      { label: 'Customer Search', icon: 'customer-search' },
      { label: 'Security Screening', icon: 'security-screening' },
      { label: 'Service & Compensation', icon: 'service-compensation' },
      { label: 'Loyalty Programme', icon: 'loyalty-programme' },
    ],
  },
]

export const ACTIVE_NAV_ITEM: NavItem = { label: 'Reports & Analytics', icon: 'reports-analytics' }

export const ADMIN_NAV_ITEM: NavItem = { label: 'Administration', icon: 'administration' }

/** The period selector above the chart. */
export const PERIODS: { id: ReportPeriod; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: '7days', label: '7 days' },
  { id: '30days', label: '30 days' },
  { id: '3months', label: '3 months' },
  { id: '12months', label: '12 months' },
]

/** Text shown at the right of the chart header for each period. */
export const PERIOD_SUMMARY: Record<ReportPeriod, string> = {
  today: 'Today',
  '7days': 'Last 7 days',
  '30days': 'Last 30 days',
  '3months': 'Last 3 months',
  '12months': 'Last 12 months',
}

/** The tabs under the page title, with the line each screen explains itself with. */
export const TABS = [
  {
    id: 'overview',
    label: 'Overview Dashboard',
    description: 'See how passengers use the airport robot: sessions per day, questions asked, and how the robot answered them.',
  },
  {
    id: 'history',
    label: 'Session History',
    description: 'Every robot session, newest first. Check when passengers used the robot and how long each conversation lasted.',
  },
  {
    id: 'qa',
    label: 'All Q&A Logs',
    description: 'Every question passengers asked and what the robot answered, so you can check the answers are correct.',
  },
] as const

export type TabId = (typeof TABS)[number]['id']

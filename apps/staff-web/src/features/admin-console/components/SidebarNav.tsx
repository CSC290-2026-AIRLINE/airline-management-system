import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { cn } from '@staff-web/lib/utils'
import administrationIcon from '../assets/icon-administration.svg'
import baggageTracking from '../assets/nav/baggage-tracking.svg'
import bookingsInventory from '../assets/nav/bookings-inventory.svg'
import cargoAirFreight from '../assets/nav/cargo-air-freight.svg'
import checkInBoarding from '../assets/nav/check-in-boarding.svg'
import crewScheduling from '../assets/nav/crew-scheduling.svg'
import customerSearch from '../assets/nav/customer-search.svg'
import fleetAircraft from '../assets/nav/fleet-aircraft.svg'
import flightOperations from '../assets/nav/flight-operations.svg'
import gateCounterDevices from '../assets/nav/gate-counter-devices.svg'
import loyaltyProgramme from '../assets/nav/loyalty-programme.svg'
import myRoster from '../assets/nav/my-roster.svg'
import onboardProducts from '../assets/nav/onboard-products.svg'
import paymentsRefunds from '../assets/nav/payments-refunds.svg'
import pricingFareRules from '../assets/nav/pricing-fare-rules.svg'
import reportsAnalytics from '../assets/nav/reports-analytics.svg'
import securityScreening from '../assets/nav/security-screening.svg'
import serviceCompensation from '../assets/nav/service-compensation.svg'

interface NavItem {
  label: string
  icon: string
}

interface NavGroup {
  label: string
  items: NavItem[]
}

/** The workspace menu from the F15 sidebar frame: one standalone item, then four groups. */
const TOP_ITEM: NavItem = { label: 'Reports & Analytics', icon: reportsAnalytics }

const GROUPS: NavGroup[] = [
  {
    label: 'Operations',
    items: [
      { label: 'Flight Operations', icon: flightOperations },
      { label: 'Fleet & Aircraft', icon: fleetAircraft },
      { label: 'Crew Scheduling', icon: crewScheduling },
      { label: 'My Roster', icon: myRoster },
    ],
  },
  {
    label: 'Commercial',
    items: [
      { label: 'Bookings & Inventory', icon: bookingsInventory },
      { label: 'Pricing & Fare Rules', icon: pricingFareRules },
      { label: 'Payments & Refunds', icon: paymentsRefunds },
      { label: 'Cargo & Air Freight', icon: cargoAirFreight },
    ],
  },
  {
    label: 'Airport & Onboard',
    items: [
      { label: 'Check-in & Boarding', icon: checkInBoarding },
      { label: 'Gate Counter & Devices', icon: gateCounterDevices },
      { label: 'Baggage Tracking', icon: baggageTracking },
      { label: 'Onboard Products', icon: onboardProducts },
    ],
  },
  {
    label: 'Customer Management',
    items: [
      { label: 'Customer Search', icon: customerSearch },
      { label: 'Security Screening', icon: securityScreening },
      { label: 'Service & Compensation', icon: serviceCompensation },
      { label: 'Loyalty Programme', icon: loyaltyProgramme },
    ],
  },
]

/**
 * These screens belong to other feature teams and have no routes in this app yet, so they are listed as unavailable
 * links (`aria-disabled`, not focusable) instead of links that go nowhere. When a team registers its route, swap its
 * entry for a `<Link>`.
 */
function PendingItem({ item, indent, compact }: { item: NavItem; indent?: boolean; compact?: boolean }) {
  return (
    <li>
      <span
        role="link"
        aria-disabled="true"
        title={compact ? item.label : undefined}
        aria-label={compact ? item.label : undefined}
        className={cn(
          'flex cursor-default items-center gap-2.5 rounded-md text-sm font-medium whitespace-nowrap text-white',
          compact ? 'size-9 justify-center' : cn('h-6.5 pr-3', indent ? 'pl-5' : 'h-8 px-3'),
        )}
      >
        <img src={item.icon} alt="" className="size-4 shrink-0" />
        {!compact && item.label}
      </span>
    </li>
  )
}

function AdminLink({ compact }: { compact?: boolean }) {
  return (
    <Link
      to="/admin/roles"
      activeOptions={{ exact: false }}
      title={compact ? 'Administration' : undefined}
      aria-label={compact ? 'Administration' : undefined}
      className={cn(
        'flex items-center rounded-md border-l-3 border-gold bg-navy-active text-sm font-medium text-white',
        compact ? 'size-9 justify-center' : 'gap-2.5 px-3 py-1.75',
      )}
    >
      <img src={administrationIcon} alt="" className="size-4 shrink-0" />
      {!compact && 'Administration'}
    </Link>
  )
}

/**
 * The sidebar's menu. Expanded: Reports & Analytics, four collapsible groups, then Administration (the only live link
 * in this feature). `compact` is the collapsed rail: icons only, a hairline between groups.
 */
export function SidebarNav({ compact = false }: { compact?: boolean }) {
  const [closed, setClosed] = useState<ReadonlySet<string>>(new Set())
  const toggle = (label: string) =>
    setClosed((prev) => {
      const next = new Set(prev)
      if (!next.delete(label)) next.add(label)
      return next
    })

  if (compact) {
    return (
      <nav aria-label="Workspace" className="mt-4 flex flex-col items-center">
        <ul className="flex flex-col items-center gap-px">
          <PendingItem item={TOP_ITEM} compact />
        </ul>
        {GROUPS.map((g) => (
          <ul key={g.label} className="mt-1 flex flex-col items-center gap-px border-t border-white/15 pt-1">
            {g.items.map((i) => (
              <PendingItem key={i.label} item={i} compact />
            ))}
          </ul>
        ))}
        <div className="mt-1 border-t border-white/15 pt-1">
          <AdminLink compact />
        </div>
      </nav>
    )
  }

  return (
    <nav aria-label="Workspace" className="mt-4 flex flex-col gap-px">
      <ul>
        <PendingItem item={TOP_ITEM} />
      </ul>
      {GROUPS.map((g) => {
        const open = !closed.has(g.label)
        const listId = `nav-group-${g.label.replace(/\W+/g, '-').toLowerCase()}`
        return (
          <div key={g.label} className="flex flex-col">
            <button
              type="button"
              aria-expanded={open}
              aria-controls={listId}
              onClick={() => toggle(g.label)}
              className="flex h-7.5 items-center rounded-md bg-[#071426] px-3 text-left text-sm font-medium whitespace-pre text-white"
            >
              {open ? '-  ' : '+  '}
              {g.label}
            </button>
            <ul id={listId} hidden={!open}>
              {g.items.map((i) => (
                <PendingItem key={i.label} item={i} indent />
              ))}
            </ul>
          </div>
        )
      })}
      <div className="mt-1">
        <AdminLink />
      </div>
    </nav>
  )
}

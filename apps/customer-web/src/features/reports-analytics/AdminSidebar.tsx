import type { NavGroup, NavIcon, NavItem } from './data'
import { ACTIVE_NAV_ITEM, ADMIN_NAV_ITEM, NAV_GROUPS } from './data'
import flythonLogo from './assets/flython-logo.svg'
import administrationIcon from './assets/icon-administration.svg'
import baggageTrackingIcon from './assets/icon-baggage-tracking.svg'
import bookingsInventoryIcon from './assets/icon-bookings-inventory.svg'
import cargoAirFreightIcon from './assets/icon-cargo-air-freight.svg'
import checkinBoardingIcon from './assets/icon-checkin-boarding.svg'
import crewSchedulingIcon from './assets/icon-crew-scheduling.svg'
import customerSearchIcon from './assets/icon-customer-search.svg'
import fleetAircraftIcon from './assets/icon-fleet-aircraft.svg'
import flightOperationsIcon from './assets/icon-flight-operations.svg'
import gateCounterDevicesIcon from './assets/icon-gate-counter-devices.svg'
import loyaltyProgrammeIcon from './assets/icon-loyalty-programme.svg'
import myRosterIcon from './assets/icon-my-roster.svg'
import onboardProductsIcon from './assets/icon-onboard-products.svg'
import paymentsRefundsIcon from './assets/icon-payments-refunds.svg'
import pricingFareRulesIcon from './assets/icon-pricing-fare-rules.svg'
import reportsAnalyticsIcon from './assets/icon-reports-analytics.svg'
import securityScreeningIcon from './assets/icon-security-screening.svg'
import serviceCompensationIcon from './assets/icon-service-compensation.svg'
import signedInDot from './assets/signed-in-dot.svg'
import simClockDot from './assets/sim-clock-dot.svg'

const ICONS: Record<NavIcon, string> = {
  'reports-analytics': reportsAnalyticsIcon,
  'flight-operations': flightOperationsIcon,
  'fleet-aircraft': fleetAircraftIcon,
  'crew-scheduling': crewSchedulingIcon,
  'my-roster': myRosterIcon,
  'bookings-inventory': bookingsInventoryIcon,
  'pricing-fare-rules': pricingFareRulesIcon,
  'payments-refunds': paymentsRefundsIcon,
  'cargo-air-freight': cargoAirFreightIcon,
  'checkin-boarding': checkinBoardingIcon,
  'gate-counter-devices': gateCounterDevicesIcon,
  'baggage-tracking': baggageTrackingIcon,
  'onboard-products': onboardProductsIcon,
  'customer-search': customerSearchIcon,
  'security-screening': securityScreeningIcon,
  'service-compensation': serviceCompensationIcon,
  'loyalty-programme': loyaltyProgrammeIcon,
  administration: administrationIcon,
}

/** The design draws every nav glyph at its natural size, centred in a 16px slot. */
function NavIconSlot({ icon }: { icon: NavIcon }) {
  return (
    <span className="ra-icon" aria-hidden="true">
      <img src={ICONS[icon]} alt="" />
    </span>
  )
}

function NavLink({ item, active = false, className = '' }: { item: NavItem; active?: boolean; className?: string }) {
  const classes = `ra-navLink${active ? ' ra-navLink--active' : ''}${className ? ` ${className}` : ''}`
  const label = (
    <>
      <NavIconSlot icon={item.icon} />
      <span>{item.label}</span>
    </>
  )

  // Only the screen this page implements has a destination, so the rest stay plain entries.
  if (active) {
    return (
      <span className={classes} aria-current="page">
        {label}
      </span>
    )
  }

  return <span className={classes}>{label}</span>
}

function NavGroupBlock({ group }: { group: NavGroup }) {
  return (
    <div className="ra-navGroup">
      <p className="ra-navGroupTitle">- {group.title}</p>
      <div className="ra-navGroupItems">
        {group.items.map((item) => (
          <NavLink key={item.label} item={item} />
        ))}
      </div>
    </div>
  )
}

/**
 * The Flython admin sidebar (Figma "F15 Sidebar"), with Reports & Analytics marked active.
 * Every position here mirrors the design frame, so the block is absolutely positioned rather than stacked.
 */
export function AdminSidebar() {
  return (
    <aside className="ra-sidebar">
      <img className="ra-sidebarLogo" src={flythonLogo} alt="Flython Airlines" />
      <p className="ra-sidebarEyebrow">ADMIN WORKSPACE</p>

      <nav className="ra-nav" aria-label="Admin workspace">
        <NavLink item={ACTIVE_NAV_ITEM} active />
        {NAV_GROUPS.map((group) => (
          <NavGroupBlock key={group.title} group={group} />
        ))}
        <div className="ra-navSpacer" />
        <NavLink item={ADMIN_NAV_ITEM} className="ra-navLink--admin" />
      </nav>

      <div className="ra-sidebarCard ra-sidebarCard--clock">
        <p className="ra-sidebarCardLabel">
          <img src={simClockDot} alt="" aria-hidden="true" />
          SIMULATION CLOCK
        </p>
        <p className="ra-sidebarCardValue">12 Nov 2026</p>
      </div>

      <div className="ra-sidebarCard ra-sidebarCard--user">
        <p className="ra-sidebarCardLabel">
          <img src={signedInDot} alt="" aria-hidden="true" />
          SIGNED IN AS
        </p>
        <p className="ra-sidebarCardValue">Administrator</p>
      </div>

      <p className="ra-sidebarHint">Menu shows the screens your role can open.</p>
      <button className="ra-sidebarSignOut" type="button">
        Sign out
      </button>

      <button className="ra-sidebarCollapse" type="button" aria-label="Collapse sidebar">
        ‹
      </button>
    </aside>
  )
}

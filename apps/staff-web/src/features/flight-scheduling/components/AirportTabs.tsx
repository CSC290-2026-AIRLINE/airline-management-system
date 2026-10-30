import { Link } from '@tanstack/react-router'

// The three tabs at the top of the Airports screens: master data, fees and the approval policy.
export function AirportTabs() {
  return (
    <nav className="fs-tabs" aria-label="Airport data">
      <Link to="/airports" className="fs-tab" activeProps={{ className: 'fs-tab fs-tab-on' }}>
        Airports
      </Link>
      <Link to="/airport-fees" className="fs-tab" activeProps={{ className: 'fs-tab fs-tab-on' }}>
        Airport fees
      </Link>
      <Link to="/approval-policy" className="fs-tab" activeProps={{ className: 'fs-tab fs-tab-on' }}>
        Approval policy
      </Link>
    </nav>
  )
}

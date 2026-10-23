import { useAuth } from '@clerk/clerk-react'
import { simClockNow } from '../connected'

interface TopBarProps {
  showCongestion: boolean
  onShowCongestion: (show: boolean) => void
}

// Chips at the top right of every staff screen.
// The clock chip is hidden until F1's simulation clock exists (see connected.ts). Every signed-in staff member has the one Staff role, so the chip says "Staff"
// whenever there is a session; it reads Clerk directly because the public schedule board sits outside AppAuthProvider.
export function TopBar({ showCongestion, onShowCongestion }: TopBarProps) {
  const { isSignedIn } = useAuth()
  const clock = simClockNow()
  return (
    <div className="fs-topbar">
      {clock !== null && (
        <span className="fs-chip">
          <span className="fs-chip-dot" aria-hidden="true" />
          <span className="fs-chip-label fs-long">Simulation clock (feature 1)</span>
          <span className="fs-chip-label fs-short">Sim clock ·</span>
          <b>{clock}</b>
        </span>
      )}
      {isSignedIn && (
        <span className="fs-chip fs-chip-who">
          <span className="fs-chip-label">Signed in as</span>
          <b>Staff</b>
        </span>
      )}
      <label className="fs-chip fs-chip-check">
        <span className="fs-chip-label">Stretch level 1</span>
        <input type="checkbox" checked={showCongestion} onChange={(e) => onShowCongestion(e.target.checked)} />
        <b>Show congestion</b>
      </label>
    </div>
  )
}

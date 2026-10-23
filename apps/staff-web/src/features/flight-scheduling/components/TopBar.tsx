import { useAuth } from '@clerk/clerk-react'
import { MOCK_CLOCK } from '../mocks/cross-feature'

interface TopBarProps {
  showCongestion: boolean
  onShowCongestion: (show: boolean) => void
}

// Chips at the top right of every staff screen.
// ponytail: MOCK clock until F1's simulation clock exists. Every signed-in staff member has the one Staff role, so the chip says "Staff"
// whenever there is a session; it reads Clerk directly because the public schedule board sits outside AppAuthProvider.
export function TopBar({ showCongestion, onShowCongestion }: TopBarProps) {
  const { isSignedIn } = useAuth()
  return (
    <div className="fs-topbar">
      <span className="fs-chip">
        <span className="fs-chip-dot" aria-hidden="true" />
        <span className="fs-chip-label fs-long">Simulation clock (feature 1, demo)</span>
        <span className="fs-chip-label fs-short">Sim clock ·</span>
        <b>{MOCK_CLOCK}</b>
      </span>
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

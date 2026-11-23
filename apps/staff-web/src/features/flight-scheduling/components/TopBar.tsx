import { simClockNow } from '../connected'

// The simulation clock chip at the top right of every staff screen. It is hidden until F1's simulation clock exists (see connected.ts).
export function TopBar() {
  const clock = simClockNow()
  if (clock === null) return null
  return (
    <div className="fs-topbar">
      <span className="fs-chip">
        <span className="fs-chip-dot" aria-hidden="true" />
        <span className="fs-chip-label fs-long">Simulation clock</span>
        <span className="fs-chip-label fs-short">Sim clock ·</span>
        <b>{clock}</b>
      </span>
    </div>
  )
}

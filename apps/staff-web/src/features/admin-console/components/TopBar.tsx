import './TopBar.css'

/**
 * The "Airlines" bar that sits above every refusal screen.
 *
 * Both refusal states render outside the admin shell — the gate is above `AdminShell` in
 * `routes/_authenticated/admin/route.tsx`, so a refused user gets no sidebar. That leaves the wordmark orphaned, and
 * a bare card floating on a grey page reads as a broken screen rather than a deliberate answer. This bar gives those
 * two states the same identity the rest of staff-web has, without dragging the whole shell in behind them.
 *
 * Deliberately not a link: the card below already carries the one action ("Back to sign in"), and a second control up
 * here would compete with it.
 */
export function TopBar() {
  return (
    <header className="top-bar">
      <span className="top-bar-word">Airlines</span>
    </header>
  )
}

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
    <header className="relative z-[2] flex min-h-[clamp(60px,6vh,80px)] w-full shrink-0 items-center bg-[#0e1b3d] px-5 font-sans text-white">
      <span className="text-[26px] font-bold tracking-[0.01em]">Airlines</span>
    </header>
  )
}

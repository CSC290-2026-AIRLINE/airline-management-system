/**
 * Chrome that only exists below the `lg` breakpoint.
 *
 * The assign-crew page uses the shared top bar in `../shared/app-shell`. The primary action moves to a
 * fixed bottom bar that stays reachable while the page scrolls.
 */
import type { ReactNode } from 'react'
import { ArrowRightIcon, ChevronLeftIcon } from '../../shared/ui'

/** Slim top bar: wordmark, simulation clock and the account menu. Fix & publish still uses this one. */
export function MobileTopBar({ simulationClockShort, accountLabel }: { simulationClockShort: string; accountLabel: string }) {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-3 bg-primary px-4 py-3.5 text-white lg:hidden">
      <span className="font-display text-[26px] leading-none font-black tracking-tight">Airlines</span>
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1.5 rounded-full bg-white/12 px-3 py-1.5 text-[12px] font-medium whitespace-nowrap">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-secondary" />
          Sim · {simulationClockShort}
        </span>
        <button
          type="button"
          aria-label={`Account menu for ${accountLabel}`}
          className="flex items-center gap-1.5 rounded-lg border border-white/20 px-2.5 py-1.5 text-[12px] font-semibold"
        >
          {accountLabel}
          <MenuIcon className="h-3.5 w-3.5" />
        </button>
      </div>
    </header>
  )
}

/**
 * Fixed bottom bar holding the step's primary action.
 *
 * The main column reserves room for it with bottom padding, so the last card in the
 * page is never trapped underneath.
 */
export function MobileBottomBar({ breakCount, onBack, onOpenFix }: { breakCount: number; onBack: () => void; onOpenFix: () => void }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 bg-primary px-4 py-3 text-white lg:hidden">
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold tracking-widest text-white/50 uppercase">Next step</p>
        <p className="truncate text-sm font-medium">
          {breakCount === 0 ? 'No breaks to fix' : `${breakCount} ${breakCount === 1 ? 'break' : 'breaks'} to fix`}
        </p>
      </div>
      <button
        type="button"
        onClick={onBack}
        aria-label="Back to Build pairings"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-white/25 text-white transition-colors hover:bg-white/10"
      >
        <ChevronLeftIcon className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={onOpenFix}
        className="flex items-center gap-2 rounded-lg bg-btn-yellow px-4 py-3 text-sm font-semibold text-primary-text transition-colors hover:bg-btn-yellow-hover"
      >
        Fix &amp; publish
        <ArrowRightIcon className="h-4 w-4" />
      </button>
    </div>
  )
}

/**
 * The narrow-screen stack: roster-run card, picker, rules, results.
 *
 * `lg:hidden` lives here rather than at the call site so the two layouts can never
 * both render — the desktop stack hides itself at `lg`, and this one hides itself back,
 * so exactly one is on screen at every width.
 */
export function PageColumn({ children }: { children: ReactNode }) {
  return <div className="flex w-full flex-col gap-4 lg:hidden">{children}</div>
}

function MenuIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={className} aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
    </svg>
  )
}

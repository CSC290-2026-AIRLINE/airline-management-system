/**
 * App shell shared by every crew-rostering page: dark sidebar, roster run badge
 * and the three-step wizard strip.
 *
 * These are chrome rather than page content, so they live at the feature root
 * instead of inside a single page. `tokens.css` stays in `build-pairings/types`
 * for now; when it moves too, point the `@import` in `src/index.css` at the new
 * path.
 */
import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { formatDateRange } from '../build-pairings/types/format'
import { Button, ChevronLeftIcon, CloseIcon } from './ui'

export type WizardStep = 'build-pairings' | 'assign-crew' | 'fix-publish'

const NAV_ITEMS = [
  { id: 'roster-runs', label: 'Roster runs' },
  { id: 'crew', label: 'Crew' },
  { id: 'rules', label: 'Rules' },
] as const

const WIZARD_STEPS: { id: WizardStep; label: string }[] = [
  { id: 'build-pairings', label: 'Build pairings' },
  { id: 'assign-crew', label: 'Assign crew' },
  { id: 'fix-publish', label: 'Fix & publish' },
]

/**
 * Compact chrome for small screens, where the sidebar's full nav does not fit.
 * The `lg` breakpoint swaps this in for `SidebarNav`. The menu button opens
 * `MobileNavDrawer`, which carries the same links.
 */
export function MobileTopBar({
  simulationClockShort,
  userName,
  activeItem,
}: {
  simulationClockShort: string
  userName: string
  activeItem: string
}) {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <>
      <header className="flex items-center justify-between gap-3 bg-primary px-4 py-4 text-white lg:hidden">
        <span className="font-display text-3xl leading-none font-black tracking-tight">Airlines</span>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 rounded-full border border-white/20 px-2.5 py-1 text-xs font-semibold">
            <span className="h-1.5 w-1.5 rounded-full bg-secondary" />
            {simulationClockShort}
          </span>
          <span className="flex items-center gap-1.5 text-[11px] font-bold tracking-wider uppercase">
            {userName}
            <button
              type="button"
              aria-label="Open navigation"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(true)}
              className="text-white/80"
            >
              <MenuIcon className="h-4 w-4" />
            </button>
          </span>
        </div>
      </header>

      {menuOpen && <MobileNavDrawer userName={userName} activeItem={activeItem} onClose={() => setMenuOpen(false)} />}
    </>
  )
}

/** Full-height navigation overlay for small screens, mirroring `SidebarNav`. */
function MobileNavDrawer({ userName, activeItem, onClose }: { userName: string; activeItem: string; onClose: () => void }) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-primary px-5 py-5 text-white lg:hidden">
      <div className="flex items-center justify-between">
        <span className="font-display text-3xl leading-none font-black tracking-tight">Airlines</span>
        <button
          type="button"
          aria-label="Close navigation"
          onClick={onClose}
          className="rounded-lg border border-white/20 p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>

      <p className="mt-7 mb-2 text-sm font-bold text-white">Crew &amp; Rostering</p>
      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const active = item.id === activeItem
          return (
            <button
              key={item.id}
              type="button"
              aria-current={active ? 'page' : undefined}
              onClick={onClose}
              className={`rounded-lg py-2 pl-4 text-left text-sm font-medium transition-colors ${
                active ? 'relative border-l-2 border-secondary bg-white/12 font-semibold text-white' : 'text-white/65'
              }`}
            >
              {item.label}
            </button>
          )
        })}
      </nav>

      <div className="mt-auto">
        <p className="font-display text-lg font-bold">{userName}</p>
        <button type="button" className="mt-1 text-sm font-medium text-white/80 underline-offset-4 hover:underline">
          Sign out
        </button>
      </div>
    </div>
  )
}

function MenuIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={className} aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
    </svg>
  )
}

/** Left navigation. `activeItem` highlights one entry. */
export function SidebarNav({
  activeItem,
  simulationClock,
  userName,
  children,
}: {
  activeItem: string
  simulationClock: string
  userName: string
  children?: ReactNode
}) {
  return (
    <aside className="hidden w-66 shrink-0 flex-col bg-primary px-5 py-6 text-white lg:flex">
      <div className="flex items-start justify-between">
        <span className="font-display text-[40px] leading-none font-black tracking-tight">Airlines</span>
        <button
          type="button"
          aria-label="Collapse navigation"
          className="mt-1 rounded-lg border border-white/20 p-1.5 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </button>
      </div>

      <p className="mt-3 text-[11px] font-semibold tracking-widest text-white/45 uppercase">Admin workspace</p>

      <p className="mt-7 mb-2 text-sm font-bold text-white">Crew &amp; Rostering</p>
      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const active = item.id === activeItem
          return (
            <button
              key={item.id}
              type="button"
              aria-current={active ? 'page' : undefined}
              className={`rounded-lg py-2 pl-4 text-left text-sm font-medium transition-colors ${
                active ? 'bg-white/12 font-semibold text-white' : 'text-white/65 hover:bg-white/8 hover:text-white'
              } ${active ? 'relative border-l-2 border-secondary' : ''}`}
            >
              {item.label}
            </button>
          )
        })}
      </nav>

      {children}

      <div className="mt-auto flex flex-col gap-6 pt-8">
        <div className="rounded-xl border border-white/15 px-3.5 py-3">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold tracking-widest text-white/50 uppercase">
            <span className="h-1.5 w-1.5 rounded-full bg-secondary" />
            Simulation clock
          </p>
          <p className="mt-1.5 text-[15px] font-medium">{simulationClock}</p>
        </div>

        <div>
          <p className="font-display text-lg font-bold">{userName}</p>
          <p className="mt-1 max-w-47.5 text-xs leading-relaxed text-white/55">Navigation follows assigned staff permissions.</p>
          <button type="button" className="mt-3 text-sm font-medium text-white/80 underline-offset-4 hover:underline">
            Sign out
          </button>
        </div>
      </div>
    </aside>
  )
}

/** Pill in the page header, e.g. `ROSTER RUN  BKK · 15–19 Sep 2026  Draft`. */
export function RosterRunBadge({ base, dateFrom, dateTo, status }: { base: string; dateFrom: string; dateTo: string; status: string }) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-border-desc/50 bg-white py-1.5 pr-1.5 pl-3.5">
      <span className="text-[10px] font-semibold tracking-wider text-primary-text/55 uppercase">Roster run</span>
      <span className="text-[13px] font-bold text-primary-text">
        {base} · {formatDateRange(dateFrom, dateTo)}
      </span>
      <span className="rounded-full bg-secondary/15 px-2.5 py-1 text-[11px] font-semibold text-primary-text">{status}</span>
      <span className="px-1 text-[11px] text-border-desc">▾</span>
    </div>
  )
}

/** Three-step wizard strip. Only `build-pairings` is reachable so far. */
export function WizardSteps({ active }: { active: WizardStep }) {
  const activeIndex = WIZARD_STEPS.findIndex((step) => step.id === active)
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl bg-primary/6 px-4 py-3.5 sm:justify-start sm:gap-3 sm:px-6">
      {WIZARD_STEPS.map((step, index) => {
        const done = index < activeIndex
        const current = index === activeIndex
        return (
          <div key={step.id} className="flex items-center gap-2 sm:gap-3">
            {index > 0 && <span className="h-px w-4 bg-primary/15 sm:w-8" />}
            <div className="flex flex-col items-center gap-1.5 sm:flex-row sm:gap-2.5">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                  current ? 'bg-btn-navy text-white' : done ? 'bg-valid text-white' : 'bg-primary/15 text-primary/60'
                }`}
              >
                {index + 1}
              </span>
              <span className={`text-center text-xs sm:hidden ${current ? 'font-bold text-primary' : 'font-medium text-primary/50'}`}>
                {SHORT_LABELS[step.id]}
              </span>
              <span className={`hidden text-sm sm:inline ${current ? 'font-bold text-primary' : 'font-medium text-primary/50'}`}>
                {step.label}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** Short step labels for small screens, where the full labels would wrap. */
const SHORT_LABELS: Record<WizardStep, string> = {
  'build-pairings': 'Build',
  'assign-crew': 'Assign',
  'fix-publish': 'Fix & publish',
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

/**
 * Two-tab strip under a page heading. `tabs` is generic so a page keeps its own
 * union of tab ids instead of widening this to `string`.
 *
 * The active tab is underlined in `primary`: the mockups show a blue rule, but
 * `ui-style.md` is the palette of record and carries no blue, and navy is the
 * colour the same mockups use for every other active marker.
 */
export function TabsNav<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: readonly { id: T; label: string }[]
  active: T
  onChange: (id: T) => void
}) {
  return (
    <div role="tablist" className="flex border-b border-border-desc/40">
      {tabs.map((tab) => {
        const current = tab.id === active
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={current}
            onClick={() => onChange(tab.id)}
            className={`-mb-px flex-1 border-b-2 px-4 py-3 text-sm font-semibold transition-colors sm:flex-none sm:px-8 ${
              current ? 'border-primary text-primary' : 'border-transparent text-primary-text/55 hover:text-primary-text'
            }`}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Unsaved-changes bar
// ---------------------------------------------------------------------------

/**
 * Strip that appears once a page has pending edits.
 *
 * `sticky bottom-4` rather than a fixed bar: it reads as a normal block when the
 * content is short, and stays reachable at the foot of the column when the page
 * scrolls. Actions go full width below `md`, per `ui-style.md`.
 */
export function BottomUnsavedBar({
  summary,
  saveLabel,
  onDiscard,
  onSave,
}: {
  summary: string
  saveLabel: string
  onDiscard: () => void
  onSave: () => void
}) {
  return (
    <div className="sticky bottom-4 flex flex-col gap-3 rounded-xl border border-primary/15 bg-info-bg px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-5">
      <p className="text-sm text-primary-text/75">{summary}</p>
      <div className="flex flex-col-reverse gap-3 sm:flex-row">
        <Button variant="outline" onClick={onDiscard} fullWidth>
          Discard
        </Button>
        <Button variant="primary" onClick={onSave} fullWidth>
          {saveLabel}
        </Button>
      </div>
    </div>
  )
}

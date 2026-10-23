/**
 * App shell for the crew-rostering pages: dark sidebar, roster run badge and the
 * three-step wizard strip.
 *
 * These are global chrome, so the design spec points at
 * `crew-rostering/shared/`. They are kept here for now because this is the only
 * page that exists; move this file to `shared/` when the other four pages land
 * and import it from there.
 */
import type { ReactNode } from 'react'
import { formatDateRange } from '../types/format'
import { CheckIcon, ChevronLeftIcon } from '../../shared/ui'

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
 * Left navigation. `activeItem` highlights one entry.
 *
 * `onSignOut` is optional: a page with the account available passes it, one without
 * keeps the inert button the mockups describe.
 */
export function SidebarNav({
  activeItem,
  simulationClock,
  userName,
  onSignOut,
  children,
}: {
  activeItem: string
  simulationClock: string
  userName: string
  onSignOut?: () => void
  children?: ReactNode
}) {
  return (
    <aside className="flex w-[264px] shrink-0 flex-col bg-primary px-5 py-6 text-white">
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
          <p className="mt-1 max-w-[190px] text-xs leading-relaxed text-white/55">Navigation follows assigned staff permissions.</p>
          <button type="button" onClick={onSignOut} className="mt-3 text-sm font-medium text-white/80 underline-offset-4 hover:underline">
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

/**
 * Three-step wizard strip. A step behind the active one is shown as a tick.
 *
 * The active step is a solid navy block holding its circle and its label together, not
 * a navy circle sitting on the band. The label is what tells the operator where they
 * are, so it has to move into the block with the number — a tinted circle alone reads as
 * a dot on a stepper rather than as the step you are on.
 *
 * `allDone` is the finished state: every step ticked and none highlighted. Step 3 needs
 * it because publishing is the thing the strip is tracking — on a live roster there is
 * no further step to move to, so leaving step 3 highlighted would imply work still to do.
 */
export function WizardSteps({ active, allDone = false }: { active: WizardStep; allDone?: boolean }) {
  const activeIndex = WIZARD_STEPS.findIndex((step) => step.id === active)
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-band-bg px-4 py-3 sm:gap-3 sm:px-6 sm:py-4">
      {WIZARD_STEPS.map((step, index) => {
        const done = allDone || index < activeIndex
        const current = !allDone && index === activeIndex
        return (
          <div key={step.id} className="flex items-center gap-2 sm:gap-3">
            {index > 0 && <span aria-hidden="true" className="h-1 w-6 shrink-0 rounded-full bg-border-desc sm:w-10" />}
            <div
              aria-current={current ? 'step' : undefined}
              className={`flex items-center gap-2 rounded-2xl py-1 pr-3.5 transition-colors sm:gap-3 sm:py-1.5 sm:pr-4.5 ${
                current ? 'bg-btn-navy pl-2 sm:pl-3' : 'pl-0.5'
              }`}
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold sm:h-8 sm:w-8 sm:text-[13px] ${
                  current
                    ? 'bg-card-bg text-btn-navy'
                    : done
                      ? 'bg-valid text-white'
                      : 'bg-card-bg/70 text-primary-text/45 ring-1 ring-border-desc/60 ring-inset'
                }`}
              >
                {done ? <CheckIcon className="h-3.5 w-3.5" /> : index + 1}
              </span>
              {/* The three labels together are wider than a phone, and the row has no
                  room to wrap — a stepper that wraps loses the line it is drawing. So
                  below `sm` the numbers carry the position and the labels go; the
                  current step still names itself further down the page. */}
              <span
                className={`hidden text-sm whitespace-nowrap sm:inline sm:text-base ${
                  current ? 'font-bold text-white' : done ? 'font-semibold text-primary-text' : 'font-medium text-primary-text/45'
                }`}
              >
                {step.label}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

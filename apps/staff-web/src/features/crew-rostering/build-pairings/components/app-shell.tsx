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
import { ChevronLeftIcon } from './ui'

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
    <div className="flex items-center gap-3 rounded-xl bg-primary/6 px-6 py-3.5">
      {WIZARD_STEPS.map((step, index) => {
        const done = index < activeIndex
        const current = index === activeIndex
        return (
          <div key={step.id} className="flex items-center gap-3">
            {index > 0 && <span className="h-px w-8 bg-primary/15" />}
            <div className="flex items-center gap-2.5">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                  current ? 'bg-btn-navy text-white' : done ? 'bg-valid text-white' : 'bg-primary/15 text-primary/60'
                }`}
              >
                {index + 1}
              </span>
              <span className={`text-sm ${current ? 'font-bold text-primary' : 'font-medium text-primary/50'}`}>{step.label}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

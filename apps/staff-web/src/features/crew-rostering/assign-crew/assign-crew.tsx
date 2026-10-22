/**
 * Assign Crew — step 2 of the roster run wizard.
 *
 * Page composition only: selection and results live in `use-assign-crew`, the
 * auto-assign decision and every rule in `crew-engine`, and the styles in the shared
 * `tokens.css`. Swapping the mock data for the backend should not require editing
 * this file beyond replacing the hook's internals.
 *
 * The page renders two layouts from one state. Above `lg` it is the desktop workspace
 * with the dark sidebar; below it the sidebar collapses into a top bar, the pairing
 * picker becomes cards, and the step's primary action moves into a fixed bottom bar.
 */
import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { MOCK_ROSTER_RUN, MOCK_SIMULATION_CLOCK } from './types/mock-data'
import { useAssignCrew } from './types/use-assign-crew'
import type { AssignmentSummary } from './types/types'
import { RosterRunBadge, SidebarNav, WizardSteps } from '../build-pairings/components/app-shell'
import { ArrowRightIcon, Button, InfoIcon } from '../build-pairings/components/ui'
import { AssignmentCards, AssignmentsTable } from './components/assignment-table'
import { MobileBottomBar, MobileTopBar, PageColumn } from './components/mobile-chrome'
import { PairingsPicker } from './components/pairings-picker'
import { RosterRunFields } from './components/roster-run-card'
import { RuleBreaksCard } from './components/rule-breaks-card'
import { RulesCard, RulesCardCompact } from './components/rules-card'
import { RunAutoAssignModal } from './modals/run-auto-assign-modal'

/** `Mon 14 Sep 2026 · 09:00` shortened for the mobile top bar. */
const SHORT_CLOCK = MOCK_SIMULATION_CLOCK.replace(/^\w{3}\s/, '')
  .split(' · ')[0]
  .replace(/\s\d{4}$/, '')

export function AssignCrewPage() {
  const state = useAssignCrew()
  const navigate = useNavigate()
  const [confirming, setConfirming] = useState(false)

  const canRun = state.selectedPairings.length > 0 && state.dateError === null
  const summary = state.summary

  /** Step 3 does not exist yet, so "Fix breaks" brings the break list into view. */
  function openFixPublish() {
    document.querySelector('[data-rule-breaks]')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function handleRun() {
    state.runAutoAssign()
    setConfirming(false)
  }

  const fields = (
    <RosterRunFields
      params={state.params}
      bases={state.bases}
      dateError={state.dateError}
      onDateFromChange={state.setDateFrom}
      onDateToChange={state.setDateTo}
      onBaseChange={state.setBase}
    />
  )

  const picker = (
    <PairingsPicker
      pairings={state.pairings}
      selectedIds={state.selectedIds}
      excluded={state.excluded}
      canRun={canRun}
      onToggle={state.togglePairing}
      onSelectAll={state.selectAll}
      onClearSelection={state.clearSelection}
      onRun={() => setConfirming(true)}
    />
  )

  return (
    <div className="flex min-h-screen w-full bg-page-bg">
      {/* `contents` keeps the sidebar a direct flex child, so its own `mt-auto`
          footer still pins to the bottom of the viewport on desktop. */}
      <div className="hidden lg:contents">
        <SidebarNav activeItem="roster-runs" simulationClock={MOCK_SIMULATION_CLOCK} userName="Administrator" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <MobileTopBar simulationClockShort={SHORT_CLOCK} accountLabel="ADMIN" />

        <main className="flex min-w-0 flex-1 flex-col gap-5 px-4 pt-5 pb-28 lg:px-8 lg:py-7 lg:pb-8">
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-primary-text uppercase lg:text-3xl">Assign crew</h1>
              <p className="mt-1 text-sm text-primary-text/60 lg:hidden">Crew are assigned to every leg automatically.</p>
              <p className="mt-1 hidden text-sm text-primary-text/60 lg:block">
                Crew are assigned to every leg automatically, then checked against the rules.
              </p>
            </div>
            <div className="hidden lg:block">
              <RosterRunBadge
                base={MOCK_ROSTER_RUN.base}
                dateFrom={MOCK_ROSTER_RUN.dateFrom}
                dateTo={MOCK_ROSTER_RUN.dateTo}
                status={MOCK_ROSTER_RUN.status}
              />
            </div>
          </header>

          <WizardSteps active="assign-crew" />

          {summary && state.assignments && <RunSummaryBanner summary={summary} onOpenFix={openFixPublish} />}

          {state.loadState === 'error' && (
            <p role="alert" className="rounded-lg border border-invalid/30 bg-invalid-bg px-4 py-3 text-sm font-medium text-invalid">
              Could not load the committed pairings. Try again.
            </p>
          )}

          {/* Desktop: roster-run fields and the picker share one card. */}
          <div className="hidden flex-col gap-5 lg:flex">
            <section className="rounded-2xl border border-border-desc/40 bg-card-bg p-7">
              <p className="text-[11px] font-semibold tracking-widest text-primary-text/60 uppercase">Roster run</p>
              {fields}
              <div className="mt-7 border-t border-border-desc/30 pt-6">{picker}</div>
            </section>

            <RulesCard />
            {state.assignments && <AssignmentsTable assignments={state.assignments} breaksByLeg={state.breaksByLeg} />}
            {state.assignments && (
              <div data-rule-breaks>
                <RuleBreaksCard breaks={state.breaks} onOpenFix={openFixPublish} />
              </div>
            )}
          </div>

          {/* Mobile: the same content, split into cards and trimmed to fit. */}
          <PageColumn>
            <section className="rounded-2xl border border-border-desc/40 bg-card-bg p-5">
              <h2 className="text-lg font-bold text-primary-text">Roster run</h2>
              <p className="mt-1 text-sm leading-relaxed text-primary-text/60">
                Pick the dates and base, then choose which pairings to crew.
              </p>
              {fields}
              <Button fullWidth className="mt-5" disabled={!canRun} onClick={() => setConfirming(true)}>
                Run auto-assign
              </Button>
            </section>

            <section className="rounded-2xl border border-border-desc/40 bg-card-bg p-5">{picker}</section>

            <RulesCardCompact />
            {state.assignments && <AssignmentCards assignments={state.assignments} breaksByLeg={state.breaksByLeg} />}
            {state.assignments && (
              <div data-rule-breaks>
                <RuleBreaksCard breaks={state.breaks} onOpenFix={openFixPublish} />
              </div>
            )}
          </PageColumn>
        </main>

        <MobileBottomBar
          breakCount={summary?.breakCount ?? 0}
          onBack={() => void navigate({ to: '/build-pairings' })}
          onOpenFix={openFixPublish}
        />
      </div>

      {confirming && (
        <RunAutoAssignModal
          pairings={state.selectedPairings}
          flightCount={state.selectedFlightCount}
          onCancel={() => setConfirming(false)}
          onConfirm={handleRun}
        />
      )}
    </div>
  )
}

/**
 * The post-run banner.
 *
 * It reports the two numbers the mockups separate on purpose: how many legs ended up
 * with a full complement, and how many legs are breaking a rule. A leg short one of
 * two police counts as crewed but broken, so reading one number as the other would
 * misreport the roster.
 */
function RunSummaryBanner({ summary, onOpenFix }: { summary: AssignmentSummary; onOpenFix: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-secondary/40 bg-secondary/10 px-4 py-3">
      <InfoIcon className="h-4 w-4 shrink-0 text-secondary" />
      <p className="flex-1 text-sm font-medium text-primary">
        Auto-assign finished · {summary.fullyCrewedLegs} of {summary.totalLegs} legs fully crewed ·{' '}
        <span className="hidden lg:inline">
          {summary.breakCount} rule breaks on {summary.brokenLegs} legs to fix in the next step.
        </span>
        <span className="lg:hidden">{summary.breakCount} rule breaks to fix.</span>
      </p>
      <Button variant="highlight" className="hidden lg:inline-flex" onClick={onOpenFix}>
        Fix breaks
        <ArrowRightIcon className="h-4 w-4" />
      </Button>
    </div>
  )
}

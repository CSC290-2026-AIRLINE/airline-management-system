/**
 * Assign Crew — step 2 of the roster run wizard.
 *
 * Page composition only: selection and results live in `use-assign-crew`, which talks
 * to `/api/crew-rostering/assign-crew`. The backend makes the auto-assign decision and
 * checks every rule; styles are in the shared `tokens.css`.
 *
 * The page renders two layouts from one state. Above `lg` it is the desktop workspace
 * with the dark sidebar; below it the sidebar collapses into a top bar, the pairing
 * picker becomes cards, and the step's primary action moves into a fixed bottom bar.
 */
import { useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useAppAuth } from '../../../auth/AuthProvider'
import { MOCK_SIMULATION_CLOCK } from './types/mock-data'
import { useAssignCrew } from './types/use-assign-crew'
import type { AssignmentSummary } from './types/types'
import { MOCK_SIMULATION_CLOCK_SHORT } from '../build-pairings/types/mock-data'
import { MobileTopBar, RosterRunBadge, SidebarNav, WizardSteps } from '../shared/app-shell'
import { ArrowRightIcon, Button } from '../shared/ui'
import { AssignmentCards, AssignmentsTable } from './components/assignment-table'
import { MobileBottomBar, PageColumn } from './components/mobile-chrome'
import { PairingsPicker } from './components/pairings-picker'
import { RosterRunFields } from './components/roster-run-card'
import { RuleBreaksCard } from './components/rule-breaks-card'
import { NoCrewAssigned, RunStatCards } from './components/run-results'
import { RulesCard, RulesCardCompact } from './components/rules-card'
import { RunAutoAssignModal } from './modals/run-auto-assign-modal'

/**
 * The account line under the sidebar wordmark.
 *
 * The backend creates every staff sign-in as `admin`, so the role is a label for now,
 * not a permission check — the backend is what enforces access. An unrecognised type
 * falls back to itself rather than to a guess. `short` is the same role squeezed into
 * the mobile account chip.
 */
const ROLE_LABELS: Record<string, { full: string; short: string }> = {
  admin: { full: 'Administrator', short: 'ADMIN' },
}

function roleLabel(type: string): { full: string; short: string } {
  return ROLE_LABELS[type] ?? { full: type, short: type.toUpperCase() }
}

export function AssignCrewPage() {
  const state = useAssignCrew()
  const navigate = useNavigate()
  const { user, logout } = useAppAuth()
  const [confirming, setConfirming] = useState(false)

  // This page sits behind `_authenticated`, so a signed-out visitor never reaches it.
  // `user === null` therefore means the `/api/auth/session` exchange is still in
  // flight, not that anyone signed out — show the mockup's role in that brief window
  // rather than a claim that is not true.
  const role = roleLabel(user?.type ?? 'admin')

  const canRun = state.rosterRun?.status === 'draft' && state.selectedPairings.length > 0 && state.dateError === null && !state.isRunning
  const summary = state.summary
  const hasResults = state.assignments !== null && summary !== null

  // Named in the rules note only when every selected leg flies the same aircraft type.
  const aircraftType = useMemo(() => {
    const types = new Set(state.pairings.flatMap((pairing) => pairing.legs.map((leg) => leg.aircraftType)))
    return types.size === 1 ? [...types][0] : undefined
  }, [state.pairings])

  /** Opens Fix & publish on the same base and dates, where the breaks are fixed and the roster is published. */
  function openFixPublish() {
    const { dateFrom, dateTo, base } = state.params
    void navigate({ to: '/fix-publish', search: { dateFrom, dateTo, base } })
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
      excluded={state.uncommitted}
      canRun={canRun}
      hasRun={hasResults}
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
      <SidebarNav activeItem="roster-runs" simulationClock={MOCK_SIMULATION_CLOCK} userName={role.full} onSignOut={() => void logout()} />

      <div className="flex min-w-0 flex-1 flex-col">
        <MobileTopBar
          simulationClockShort={MOCK_SIMULATION_CLOCK_SHORT}
          userName={role.short}
          activeItem="roster-runs"
          onSignOut={() => void logout()}
        />

        <main className={`flex min-w-0 flex-1 flex-col gap-5 px-4 pt-5 lg:px-9 lg:py-7 lg:pb-9 ${hasResults ? 'pb-28' : 'pb-8'}`}>
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-primary-text uppercase lg:text-3xl">Assign crew</h1>
              <p className="mt-1.5 text-sm text-primary-text/60 lg:hidden">Crew are assigned to every leg automatically.</p>
              <p className="mt-1.5 hidden text-base text-primary-text/60 lg:block">
                Crew are assigned to every leg automatically, then checked against the rules.
              </p>
            </div>
            <div className="hidden lg:block">
              <RosterRunBadge
                base={state.rosterRun?.base ?? state.params.base}
                dateFrom={state.rosterRun?.dateFrom ?? state.params.dateFrom}
                dateTo={state.rosterRun?.dateTo ?? state.params.dateTo}
                status={
                  state.rosterRun && state.pairings.length > 0
                    ? state.rosterRun.status === 'published'
                      ? 'Published'
                      : 'Draft'
                    : 'Not committed'
                }
              />
            </div>
          </header>

          <div className="lg:mb-4">
            <WizardSteps active="assign-crew" />
          </div>

          {summary && state.assignments && <RunSummaryBanner summary={summary} onOpenFix={openFixPublish} />}

          {state.runError && (
            <p role="alert" className="rounded-lg border border-invalid/30 bg-invalid-bg px-4 py-3 text-sm font-medium text-invalid">
              {state.runError}
            </p>
          )}

          {state.rosterRun?.status === 'published' && (
            <p className="rounded-lg border border-secondary/40 bg-secondary/10 px-4 py-3 text-sm font-medium text-primary">
              This roster is published. Change crew in Fix &amp; publish instead of running auto-assign again.
            </p>
          )}

          {state.loadState === 'error' && (
            <p role="alert" className="rounded-lg border border-invalid/30 bg-invalid-bg px-4 py-3 text-sm font-medium text-invalid">
              {state.loadError ?? 'Could not load the committed pairings. Try again.'}
            </p>
          )}

          {/* Desktop: roster-run fields and the picker share one card. */}
          <div className="hidden flex-col gap-5 lg:flex">
            <section className="rounded-2xl border border-border-desc/40 bg-card-bg p-7">
              <p className="text-xs font-semibold tracking-wider text-label uppercase">Roster run</p>
              {fields}
              <div className="mt-7">{picker}</div>
            </section>

            <RulesCard limits={state.limits} aircraftType={aircraftType} />
            {hasResults ? (
              <>
                <RunStatCards summary={summary} />
                <AssignmentsTable assignments={state.assignments!} breaksByLeg={state.breaksByLeg} />
                {state.breaks.length > 0 && (
                  <div data-rule-breaks>
                    <RuleBreaksCard breaks={state.breaks} onOpenFix={openFixPublish} />
                  </div>
                )}
              </>
            ) : (
              <NoCrewAssigned committedCount={state.pairings.length} />
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
              {hasResults && (
                <Button fullWidth className="mt-5 h-11" disabled={!canRun} onClick={() => setConfirming(true)}>
                  Re-run auto-assign
                </Button>
              )}
            </section>

            {/* Before a run the picker is its own card; afterwards it folds away so the results come first. */}
            {hasResults ? (
              <details className="group rounded-2xl border border-border-desc/40 bg-card-bg p-5">
                <summary className="flex cursor-pointer list-none items-center justify-between text-lg font-bold text-primary-text">
                  Committed pairings
                  <span className="text-xs font-semibold text-primary-text/55">{state.selectedIds.length} selected</span>
                </summary>
                <div className="mt-3">
                  <PairingsPicker
                    pairings={state.pairings}
                    selectedIds={state.selectedIds}
                    excluded={state.uncommitted}
                    canRun={canRun}
                    showRun={false}
                    onToggle={state.togglePairing}
                    onSelectAll={state.selectAll}
                    onClearSelection={state.clearSelection}
                    onRun={() => setConfirming(true)}
                  />
                </div>
              </details>
            ) : (
              <section className="rounded-2xl border border-border-desc/40 bg-card-bg p-5">{picker}</section>
            )}

            <RulesCardCompact limits={state.limits} aircraftType={aircraftType} />
            {hasResults ? (
              <>
                <RunStatCards summary={summary} />
                <AssignmentCards assignments={state.assignments!} breaksByLeg={state.breaksByLeg} />
                {state.breaks.length > 0 && (
                  <div data-rule-breaks>
                    <RuleBreaksCard breaks={state.breaks} onOpenFix={openFixPublish} />
                  </div>
                )}
              </>
            ) : (
              <NoCrewAssigned committedCount={state.pairings.length} />
            )}
          </PageColumn>
        </main>

        {hasResults && (
          <MobileBottomBar
            breakCount={summary.breakCount}
            onBack={() => void navigate({ to: '/build-pairings', search: { ...state.params } })}
            onOpenFix={openFixPublish}
          />
        )}
      </div>

      {confirming && (
        <RunAutoAssignModal
          pairings={state.selectedPairings}
          base={state.params.base}
          flightCount={state.selectedFlightCount}
          isRerun={hasResults}
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
  const clean = summary.breakCount === 0
  return (
    <div
      role="status"
      className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${
        clean ? 'border-green-line bg-green-tint text-valid' : 'border-amber-line bg-amber-tint text-amber-ink'
      }`}
    >
      <span aria-hidden="true" className="w-4 shrink-0 text-center text-base leading-none font-extrabold">
        {clean ? '✓' : '!'}
      </span>
      <p className="flex-1 text-sm font-semibold">
        Auto-assign finished · {summary.fullyCrewedLegs} of {summary.totalLegs} legs fully crewed ·{' '}
        {clean ? (
          'no rule breaks.'
        ) : (
          <>
            <span className="hidden lg:inline">
              {summary.breakCount} rule {summary.breakCount === 1 ? 'break' : 'breaks'} on {summary.brokenLegs}{' '}
              {summary.brokenLegs === 1 ? 'leg' : 'legs'} to fix in the next step.
            </span>
            <span className="lg:hidden">
              {summary.breakCount} rule {summary.breakCount === 1 ? 'break' : 'breaks'} to fix.
            </span>
          </>
        )}
      </p>
      <Button variant="highlight" className="hidden shrink-0 lg:inline-flex" onClick={onOpenFix}>
        {clean ? 'Fix & publish' : 'Fix breaks'}
        <ArrowRightIcon className="h-4 w-4" />
      </Button>
    </div>
  )
}

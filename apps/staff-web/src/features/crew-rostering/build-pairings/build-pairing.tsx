/**
 * Build Pairings — step 1 of the roster run wizard.
 *
 * Page composition only: every piece of state lives in `use-build-pairings`
 * (which talks to `/api/crew-rostering/build-pairing`), every legality rule in
 * `pairing-engine`, and every style in `tokens.css`.
 */
import { useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { MOCK_SIMULATION_CLOCK, MOCK_SIMULATION_CLOCK_SHORT } from './types/mock-data'
import { suggestFixes, validatePairing } from './types/pairing-engine'
import { useBuildPairings } from './types/use-build-pairings'
import { useMediaQuery } from './types/use-media-query'
import { useAppAuth } from '../../../auth/AuthProvider'
import type { FlightLeg, Pairing } from './types/types'
import { RosterRunBadge, SidebarNav, WizardSteps, MobileTopBar } from '../shared/app-shell'
import { BuildSettingsCard, NoPairingsEmptyState, NoSelectionEmptyState } from './components/build-settings-card'
import { GeneratedPairingsLabel, PairingCard } from './components/pairing-card'
import { InspectorSheet } from './components/inspector-sheet'
import { PageNoticeView } from './components/page-notice'
import { PairingDetailInspector } from './components/pairing-detail-inspector'
import { CommitFooter, SummaryMetricsBar } from './components/summary-metrics-bar'
import { AlertBanner } from '../shared/ui'
import { EditLegsModal } from './modals/edit-legs-modal'
import { DeletePairingModal } from './modals/delete-pairing-modal'

export function BuildPairingsPage() {
  const state = useBuildPairings()
  const { logout } = useAppAuth()
  const navigate = useNavigate()
  const [editing, setEditing] = useState<Pairing | null>(null)
  const [deleting, setDeleting] = useState<Pairing | null>(null)

  // Validity is always derived, never stored, so a badge and its checks agree.
  const evaluations = useMemo(() => new Map(state.pairings.map((pairing) => [pairing.id, validatePairing(pairing)])), [state.pairings])

  // A run with nothing committed to it yet is not a draft roster, whatever the database holds.
  const runHasPairings = state.rosterRun !== null && state.pairings.some((pairing) => pairing.rosterRunId === state.rosterRun?.id)

  const selected = state.pairings.find((pairing) => pairing.id === state.selectedId && !pairing.deleted)
  const selectedEvaluation = selected ? evaluations.get(selected.id) : undefined
  // Wide screens keep a side panel once a card has been picked, even after the pick is deleted.
  const isWide = useMediaQuery('(min-width: 1280px)')
  // Keyed to the window, so changing dates, base or results closes it without an effect.
  const { dateFrom, dateTo, base } = state.params
  const windowKey = `${dateFrom}|${dateTo}|${base}|${state.hasGenerated}`
  const [panelFor, setPanelFor] = useState<string | null>(null)
  const fixes = useMemo(() => (selected ? suggestFixes(selected, state.flights) : []), [selected, state.flights])
  const showInspector = isWide && panelFor === windowKey

  function select(id: string) {
    setPanelFor(windowKey)
    state.select(id)
  }

  function handleSaveLegs(legs: FlightLeg[]) {
    if (!editing) return
    state.saveLegs(editing.id, legs)
    setEditing(null)
  }

  /** Opens Assign crew on a run that already holds committed pairings, which may be for a different window than the one on screen. */
  function continueToAssign() {
    if (!state.continueWindow) return
    void navigate({ to: '/assign-crew', search: state.continueWindow })
  }

  /** Commits the valid pairings, then opens Assign crew on the same base and dates. Ignores a click while a write is in flight. */
  function commit() {
    if (state.isSaving) return
    state.commit(() => void navigate({ to: '/assign-crew', search: { dateFrom, dateTo, base } }))
  }

  return (
    <div className="flex min-h-screen w-full flex-col bg-page-bg lg:flex-row">
      <SidebarNav
        activeItem="roster-runs"
        simulationClock={MOCK_SIMULATION_CLOCK}
        userName="Administrator"
        onSignOut={() => void logout()}
      />
      <MobileTopBar
        simulationClockShort={MOCK_SIMULATION_CLOCK_SHORT}
        userName="Administrator"
        activeItem="roster-runs"
        onSignOut={() => void logout()}
      />

      {/* Bottom padding clears the fixed commit footer on small screens. */}
      <main className="flex min-w-0 flex-1 flex-col gap-5 px-4 pt-5 pb-28 sm:px-6 sm:py-7 lg:px-9 lg:pb-9">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-primary-text uppercase sm:text-3xl">Build pairings</h1>
            <p className="mt-1.5 text-sm text-primary-text/60 sm:text-base">
              Turn scheduled flights into pairings that start and end at base. Only valid pairings move on.
            </p>
          </div>
          <div className="hidden sm:block">
            <RosterRunBadge
              base={state.rosterRun?.base ?? state.params.base}
              dateFrom={state.rosterRun?.dateFrom ?? state.params.dateFrom}
              dateTo={state.rosterRun?.dateTo ?? state.params.dateTo}
              status={runStatusLabel(runHasPairings ? state.rosterRun?.status : undefined)}
            />
          </div>
        </header>

        <div className="sm:mb-5">
          <WizardSteps active="build-pairings" />
        </div>

        {state.notice && <PageNoticeView notice={state.notice} onDismiss={state.dismissNotice} />}

        <BuildSettingsCard
          params={state.params}
          bases={state.bases}
          dateError={state.dateError}
          hasGenerated={state.hasGenerated}
          isLoading={state.loadState === 'loading'}
          onDateFromChange={state.setDateFrom}
          onDateToChange={state.setDateTo}
          onBaseChange={state.setBase}
          onGenerate={() => {
            setPanelFor(null)
            state.generate()
          }}
          onClear={() => {
            setPanelFor(null)
            state.clearPairings()
          }}
        />

        {state.loadState === 'error' && (
          <AlertBanner tone="warning">{state.loadError ?? 'Could not load the schedule. Try generating again.'}</AlertBanner>
        )}

        {!state.hasGenerated && state.loadState !== 'error' && <NoPairingsEmptyState />}

        {state.hasGenerated && state.pairings.length === 0 && <NoPairingsEmptyState />}

        {state.hasGenerated && state.pairings.length > 0 && (
          <>
            <SummaryMetricsBar
              metrics={state.metrics}
              canContinue={state.continueWindow !== null}
              onCommit={commit}
              onContinue={continueToAssign}
            />

            <GeneratedPairingsLabel />

            {/* On a wide screen the cards fill a 2-up grid until one is picked, then a single
                column sits beside the inspector. Below `xl` the inspector is a sheet instead. */}
            <div className={`grid items-start gap-5 ${showInspector ? 'xl:grid-cols-2' : ''}`}>
              <div className={`grid grid-cols-1 content-start gap-3 sm:gap-5 ${showInspector ? '' : 'xl:grid-cols-2'}`}>
                {state.pairings.map((pairing) => (
                  <PairingCard
                    key={pairing.id}
                    pairing={pairing}
                    evaluation={evaluations.get(pairing.id)!}
                    isSelected={pairing.id === state.selectedId}
                    onSelect={() => select(pairing.id)}
                  />
                ))}
              </div>

              {showInspector &&
                (selected && selectedEvaluation ? (
                  <div className="sticky top-7">
                    <PairingDetailInspector
                      pairing={selected}
                      evaluation={selectedEvaluation}
                      fixes={fixes}
                      isSaving={state.isSaving}
                      onApplyFix={(fix) => state.saveLegs(selected.id, fix.legs)}
                      onEditLegs={() => setEditing(selected)}
                      onDelete={() => setDeleting(selected)}
                    />
                  </div>
                ) : (
                  <NoSelectionEmptyState />
                ))}
            </div>
          </>
        )}
      </main>

      {state.hasGenerated && state.pairings.length > 0 && (
        <CommitFooter metrics={state.metrics} canContinue={state.continueWindow !== null} onCommit={commit} onContinue={continueToAssign} />
      )}

      {!isWide && selected && selectedEvaluation && (
        <InspectorSheet onClose={() => state.select(null)}>
          <PairingDetailInspector
            pairing={selected}
            evaluation={selectedEvaluation}
            fixes={fixes}
            isSaving={state.isSaving}
            onApplyFix={(fix) => state.saveLegs(selected.id, fix.legs)}
            onEditLegs={() => setEditing(selected)}
            onDelete={() => setDeleting(selected)}
            onClose={() => state.select(null)}
          />
        </InspectorSheet>
      )}

      {editing && <EditLegsModal pairing={editing} allFlights={state.flights} onCancel={() => setEditing(null)} onSave={handleSaveLegs} />}

      {deleting && (
        <DeletePairingModal
          pairing={deleting}
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            state.deletePairing(deleting.id)
            setDeleting(null)
          }}
        />
      )}
    </div>
  )
}

/** The badge's status pill: the run's own status, or that nothing has been committed yet. */
function runStatusLabel(status: 'draft' | 'published' | undefined): string {
  if (status === 'published') return 'Published'
  if (status === 'draft') return 'Draft'
  return 'Not committed'
}

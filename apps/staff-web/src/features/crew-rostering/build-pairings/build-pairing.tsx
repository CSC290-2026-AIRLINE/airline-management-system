/**
 * Build Pairings — step 1 of the roster run wizard.
 *
 * Page composition only: every piece of state lives in `use-build-pairings`,
 * every legality rule in `pairing-engine`, and every style in `tokens.css`.
 * Swapping the mock data for the backend should not require editing this file
 * beyond replacing the hook's internals.
 */
import { useMemo, useState } from 'react'
import { MOCK_ROSTER_RUN, MOCK_SIMULATION_CLOCK } from './types/mock-data'
import { validatePairing } from './types/pairing-engine'
import { useBuildPairings } from './types/use-build-pairings'
import type { FlightLeg, Pairing } from './types/types'
import { RosterRunBadge, SidebarNav, WizardSteps } from './components/app-shell'
import { BuildSettingsCard, NoPairingsEmptyState, NoSelectionEmptyState } from './components/build-settings-card'
import { GeneratedPairingsLabel, PairingCard } from './components/pairing-card'
import { PairingDetailInspector } from './components/pairing-detail-inspector'
import { SummaryMetricsBar } from './components/summary-metrics-bar'
import { AlertBanner } from './components/ui'
import { EditLegsModal } from './modals/edit-legs-modal'
import { DeletePairingModal } from './modals/delete-pairing-modal'

export function BuildPairingsPage() {
  const state = useBuildPairings()
  const [editing, setEditing] = useState<Pairing | null>(null)
  const [deleting, setDeleting] = useState<Pairing | null>(null)

  // Validity is always derived, never stored, so a badge and its checks agree.
  const evaluations = useMemo(() => new Map(state.pairings.map((pairing) => [pairing.id, validatePairing(pairing)])), [state.pairings])

  const selected = state.pairings.find((pairing) => pairing.id === state.selectedId && !pairing.deleted)
  const selectedEvaluation = selected ? evaluations.get(selected.id) : undefined
  const showInspector = state.selectedId !== null

  function handleSaveLegs(legs: FlightLeg[]) {
    if (!editing) return
    state.saveLegs(editing.id, legs)
    setEditing(null)
  }

  return (
    <div className="flex min-h-screen w-full bg-page-bg">
      <SidebarNav activeItem="roster-runs" simulationClock={MOCK_SIMULATION_CLOCK} userName="Administrator" />

      <main className="flex min-w-0 flex-1 flex-col gap-5 px-8 py-7">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-primary-text uppercase">Build pairings</h1>
            <p className="mt-1 text-sm text-primary-text/60">
              Turn scheduled flights into pairings that start and end at base. Only valid pairings move on.
            </p>
          </div>
          <RosterRunBadge
            base={MOCK_ROSTER_RUN.base}
            dateFrom={MOCK_ROSTER_RUN.dateFrom}
            dateTo={MOCK_ROSTER_RUN.dateTo}
            status={MOCK_ROSTER_RUN.status}
          />
        </header>

        <WizardSteps active="build-pairings" />

        {state.notice && <AlertBanner tone={state.notice.tone}>{state.notice.message}</AlertBanner>}

        <BuildSettingsCard
          params={state.params}
          bases={state.bases}
          dateError={state.dateError}
          hasGenerated={state.hasGenerated}
          isLoading={state.loadState === 'loading'}
          onDateFromChange={state.setDateFrom}
          onDateToChange={state.setDateTo}
          onBaseChange={state.setBase}
          onGenerate={state.generate}
          onClear={state.clearPairings}
        />

        {state.loadState === 'error' && <AlertBanner tone="warning">Could not load the schedule. Try generating again.</AlertBanner>}

        {!state.hasGenerated && state.loadState !== 'error' && <NoPairingsEmptyState />}

        {state.hasGenerated && state.pairings.length === 0 && <NoPairingsEmptyState />}

        {state.hasGenerated && state.pairings.length > 0 && (
          <>
            <SummaryMetricsBar metrics={state.metrics} onCommit={() => undefined} />

            <GeneratedPairingsLabel />

            {/* Without a selection the cards fill a 2-up grid; with one, the
                left column narrows to a single list beside the inspector. */}
            <div className={`grid items-start gap-5 ${showInspector ? 'grid-cols-2' : ''}`}>
              <div className={`grid content-start grid-cols-1 gap-5 ${showInspector ? '' : 'xl:grid-cols-2'}`}>
                {state.pairings.map((pairing) => (
                  <PairingCard
                    key={pairing.id}
                    pairing={pairing}
                    evaluation={evaluations.get(pairing.id)!}
                    isSelected={pairing.id === state.selectedId}
                    onSelect={() => state.select(pairing.id)}
                  />
                ))}
              </div>

              {showInspector ? (
                selected && selectedEvaluation ? (
                  <div className="sticky top-7">
                    <PairingDetailInspector
                      pairing={selected}
                      evaluation={selectedEvaluation}
                      onEditLegs={() => setEditing(selected)}
                      onDelete={() => setDeleting(selected)}
                    />
                  </div>
                ) : (
                  <NoSelectionEmptyState />
                )
              ) : (
                <div />
              )}
            </div>
          </>
        )}
      </main>

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

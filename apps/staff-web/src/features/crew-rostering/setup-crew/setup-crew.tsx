/**
 * Setup Crew — the master crew database.
 *
 * Two views share one component because the spec defines them as two routes
 * over the same data: `crewId` absent is the directory, `crewId` set is that
 * profile's details page. The router stays thin and passes the id straight in.
 *
 * Composition only: state lives in `useSetupCrew` (which talks to the backend through
 * `api`), and the form rules live in `crew-form` and `format`. A modal closes only once
 * the backend has saved; a failed save leaves it open and shows the reason as a notice.
 */
import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { AlertBanner, ArrowLeftIcon, EmptyFaceIcon, Toast } from '../shared/ui'
import { CrewDirectoryTable, NoCrewMatchState } from './components/crew-directory-table'
import { CrewFilterBar } from './components/crew-filter-bar'
import { CrewProfileView } from './components/crew-profile-view'
import { CrewSummaryCards } from './components/crew-summary-cards'
import { CertificationModal } from './modals/certification-modal'
import { CrewProfileModal } from './modals/crew-profile-modal'
import { useSetupCrew } from './types/use-setup-crew'
import type { Certification, CertificationInput } from './types/types'

export function SetupCrewPage({ crewId }: { crewId?: string }) {
  const state = useSetupCrew()
  const navigate = useNavigate()

  const [creating, setCreating] = useState(false)
  const [editingProfile, setEditingProfile] = useState(false)
  const [addingCertification, setAddingCertification] = useState(false)
  const [editingCertification, setEditingCertification] = useState<Certification | null>(null)

  const crew = crewId ? state.crew.find((member) => member.id === crewId) : undefined
  const isLoading = state.loadState === 'loading'

  async function handleCertificationSubmit(input: CertificationInput) {
    if (!crew) return
    if (editingCertification) {
      if (await state.updateCertification(crew.id, editingCertification.id, input)) setEditingCertification(null)
    } else if (await state.addCertification(crew.id, input)) {
      setAddingCertification(false)
    }
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex min-w-0 flex-1 flex-col gap-5 px-4 pt-1 pb-8 lg:px-9 lg:py-7 lg:pb-9">
        <header className="max-lg:mt-4">
          <h1 className="text-2xl font-extrabold tracking-tight text-primary-text uppercase lg:text-3xl">
            {crew ? 'Crew profile' : 'Crew'}
          </h1>
          <p className="mt-1.5 text-sm leading-relaxed text-primary-text/60 lg:text-base">
            {crew
              ? 'Profile, qualifications, eligibility and upcoming duties.'
              : 'Crew profiles used for automatic assignment: role, home base and languages.'}
          </p>
        </header>

        {crew ? (
          <>
            <button
              type="button"
              onClick={() => navigate({ to: '/setup-crew' })}
              className="flex w-fit items-center gap-1.5 text-sm font-semibold text-blue-700 transition-colors hover:text-blue-800 focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
            >
              <ArrowLeftIcon className="h-4 w-4" />
              Back
            </button>

            <CrewProfileView
              crew={crew}
              expiryWarningDays={state.expiryWarningDays}
              onEditProfile={() => setEditingProfile(true)}
              onAddCertification={() => setAddingCertification(true)}
              onEditCertification={(certification) => setEditingCertification(certification)}
            />
          </>
        ) : (
          <>
            <CrewSummaryCards metrics={state.metrics} />

            {/* One card from `lg`, holding the filters and the table. On a phone the filters sit on the page and only the list is a card. */}
            <div className="flex flex-col gap-5 lg:gap-6 lg:rounded-2xl lg:border lg:border-border-desc/40 lg:bg-card-bg lg:p-7">
              <CrewFilterBar
                filters={state.filters}
                bases={state.bases}
                resultCount={state.visibleCrew.length}
                onSearchChange={state.setSearch}
                onBaseChange={state.setBase}
                onRoleChange={state.setRole}
                onCreate={() => setCreating(true)}
              />

              {isLoading && <p className="text-sm text-primary-text/60">Loading crew…</p>}

              {state.loadState === 'error' && <AlertBanner tone="warning">Could not load the crew list. Try again shortly.</AlertBanner>}

              {/* An id that no longer resolves is a dead link, not an empty roster. */}
              {crewId && !crew && !isLoading && state.loadState !== 'error' && <UnknownCrewState />}

              {state.loadState === 'idle' && (
                <section className="max-lg:rounded-2xl max-lg:border max-lg:border-border-desc/40 max-lg:bg-card-bg max-lg:p-5">
                  <h2 className="text-lg font-extrabold tracking-tight text-primary-text lg:text-2xl">
                    <span className="lg:hidden">Crew profiles</span>
                    <span className="max-lg:hidden">Profiles</span>
                  </h2>
                  <p className="mt-1 text-xs text-primary-text/55 lg:text-sm">
                    <span className="lg:hidden">
                      {state.visibleCrew.length} of {state.metrics.totalCrew} crew members shown
                    </span>
                    <span className="max-lg:hidden">
                      Showing {state.visibleCrew.length} of {state.metrics.totalCrew} crew members
                    </span>
                  </p>

                  <div className="mt-4">
                    <CrewDirectoryTable
                      crew={state.visibleCrew}
                      onSelect={(id) => navigate({ to: '/setup-crew/$crewId', params: { crewId: id } })}
                      empty={<NoCrewMatchState searchTerm={state.filters.search} onClear={state.clearFilters} />}
                    />
                  </div>

                  <p className="mt-4 text-xs leading-relaxed text-primary-text/55 lg:text-[13px]">
                    Languages determine local-crew eligibility. Police are rostered as crew and fly as passengers.
                  </p>
                </section>
              )}
            </div>
          </>
        )}
      </div>

      {state.notice && <Toast message={state.notice.message} shortMessage={state.notice.shortMessage} onDismiss={state.dismissNotice} />}

      {creating && (
        <CrewProfileModal
          mode="create"
          crew={null}
          bases={state.bases}
          fleets={state.fleets}
          languages={state.languages}
          suggestedEmployeeNo={state.suggestedEmployeeNo}
          takenNumbers={state.employeeNumbersInUse(null)}
          onCancel={() => setCreating(false)}
          onSubmit={async (input) => {
            if (await state.createCrew(input)) setCreating(false)
          }}
        />
      )}

      {editingProfile && crew && (
        <CrewProfileModal
          mode="edit"
          crew={crew}
          bases={state.bases}
          fleets={state.fleets}
          languages={state.languages}
          suggestedEmployeeNo={crew.employeeNo}
          takenNumbers={state.employeeNumbersInUse(crew.id)}
          onCancel={() => setEditingProfile(false)}
          onSubmit={async (input) => {
            if (await state.updateCrew(crew.id, input)) setEditingProfile(false)
          }}
        />
      )}

      {addingCertification && (
        <CertificationModal
          mode="add"
          certification={null}
          fleets={state.fleets}
          onCancel={() => setAddingCertification(false)}
          onSubmit={handleCertificationSubmit}
        />
      )}

      {editingCertification && crew && (
        <CertificationModal
          mode="edit"
          certification={editingCertification}
          fleets={state.fleets}
          onCancel={() => setEditingCertification(null)}
          onSubmit={handleCertificationSubmit}
          onRemove={async () => {
            if (await state.removeCertification(crew.id, editingCertification.id)) setEditingCertification(null)
          }}
        />
      )}
    </div>
  )
}

function UnknownCrewState() {
  return (
    <div className="flex flex-col items-center rounded-xl border border-border-desc/40 bg-card-bg px-6 py-14 text-center">
      <EmptyFaceIcon className="h-14 w-14 text-border-desc" />
      <p className="mt-4 font-display text-xl font-bold text-primary-text">This crew profile no longer exists</p>
      <p className="mt-1.5 text-sm text-primary-text/60">It may have been removed from the roster since this link was opened.</p>
    </div>
  )
}

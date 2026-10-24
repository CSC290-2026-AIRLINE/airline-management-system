/**
 * Fix & Publish — step 3 of the roster run wizard.
 *
 * Page composition only, the same split as step 2: selection and results live in
 * `use-fix-publish`, which talks to `/api/crew-rostering/fix-publish`. The backend
 * writes every sentence and decides who may take a seat; the styles are in the shared
 * `tokens.css`.
 *
 * The layout is a two-column workspace above `xl` — breaks on the left, the fix for
 * the selected break on the right — because fixing is a loop between the two and making
 * either one scroll away breaks it. Below `xl` they stack and the primary action moves
 * into a fixed bottom bar.
 */
import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useAppAuth } from '../../../auth/AuthProvider'
import { MOCK_SIMULATION_CLOCK, MOCK_SIMULATION_CLOCK_SHORT } from '../build-pairings/types/mock-data'
import { MobileTopBar, RosterRunBadge, SidebarNav, WizardSteps } from '../shared/app-shell'
import { ArrowLeftIcon, ArrowRightIcon, Button, ChevronLeftIcon } from '../shared/ui'
import { BreakChips } from './components/break-chips'
import { BreakList, SeatRules } from './components/break-list'
import { ClosedList } from './components/closed-list'
import { FixPanel } from './components/fix-panel'
import { NoticeStrip } from './components/notice-strip'
import { ProgressHeader } from './components/progress-header'
import { PublishChecks } from './components/publish-checks'
import { RosterTable } from './components/roster-table'
import { RulesStrip } from './components/rules-strip'
import { OverrideModal } from './modals/override-modal'
import { RemoveMemberModal } from './modals/remove-member-modal'
import { SickCallModal } from './modals/sick-call-modal'
import { useFixPublish } from './types/use-fix-publish'
import { DEFAULT_RULE_LIMITS } from '../assign-crew/types/roster-rules'
import type { FixBreak, LegAssignment } from './types/types'

/**
 * The account line under the sidebar wordmark.
 *
 * Every staff sign-in is created as `admin` on the backend, so this is a label and not
 * a permission check — the backend is what enforces access. An unrecognised type falls
 * back to itself rather than to a guess.
 */
const ROLE_LABELS: Record<string, { full: string; short: string }> = {
  admin: { full: 'Administrator', short: 'ADMIN' },
}

function roleLabel(type: string): { full: string; short: string } {
  return ROLE_LABELS[type] ?? { full: type, short: type.toUpperCase() }
}

export function FixPublishPage() {
  const state = useFixPublish()
  const navigate = useNavigate()
  const { user, logout } = useAppAuth()
  const [overriding, setOverriding] = useState<FixBreak | null>(null)
  const [picking, setPicking] = useState<LegAssignment | null>(null)
  const [removing, setRemoving] = useState<{ assignment: LegAssignment; memberId: string } | null>(null)

  // Behind `_authenticated`, so a signed-out visitor never reaches this page and
  // `user === null` only means the `/api/auth/session` exchange is still in flight.
  const role = roleLabel(user?.type ?? 'admin')

  const closed = state.breaks.filter((item) => item.resolution !== undefined)
  const hasOpen = state.openBreaks.length > 0
  const isPublished = state.status === 'published'
  const seatOnly = state.openBreaks.every((item) => item.code === 'NO_LEGAL_CREW')
  const windowSearch = { dateFrom: state.params.dateFrom, dateTo: state.params.dateTo, base: state.params.base }
  const hasRun = state.rosterRun !== null
  const backToRoster = isPublished && hasOpen
  const base = state.rosterRun?.base ?? state.params.base

  const panelProps = {
    item: state.selectedBreak,
    base,
    openCount: state.openBreaks.length,
    rosterFor: state.rosterFor,
    isBusy: state.isBusy,
    onOverride: setOverriding,
    onSwap: state.swapIn,
  }

  function pickAbsent(assignment: LegAssignment, memberId: string) {
    setPicking(null)
    setRemoving({ assignment, memberId })
  }

  return (
    <div className="flex min-h-screen w-full bg-page-bg">
      <SidebarNav activeItem="roster-runs" simulationClock={MOCK_SIMULATION_CLOCK} userName={role.full} onSignOut={() => void logout()} />

      <div className="flex min-w-0 flex-1 flex-col">
        <MobileTopBar
          simulationClockShort={MOCK_SIMULATION_CLOCK_SHORT}
          userName={role.short}
          activeItem="roster-runs"
          onSignOut={() => void logout()}
        />

        <main className="flex min-w-0 flex-1 flex-col gap-5 px-4 pt-5 pb-28 lg:px-9 lg:py-7 lg:pb-9">
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-primary-text uppercase lg:text-3xl">Fix &amp; publish</h1>
              <p className="mt-1.5 text-sm leading-relaxed text-primary-text/60 lg:hidden">Fix each break, then publish the roster.</p>
              <p className="mt-1.5 hidden max-w-3xl text-base leading-relaxed text-primary-text/60 lg:block">
                Fix each rule break, then publish the roster. Law rules must be fixed; company rules can be overridden with a reason.
              </p>
            </div>
            <div className="hidden lg:block">
              <RosterRunBadge
                base={state.rosterRun?.base ?? state.params.base}
                dateFrom={state.rosterRun?.dateFrom ?? state.params.dateFrom}
                dateTo={state.rosterRun?.dateTo ?? state.params.dateTo}
                status={state.rosterStatusLabel}
              />
            </div>
          </header>

          <div className="lg:mb-1">
            <WizardSteps active="fix-publish" allDone={isPublished && !hasOpen} />
          </div>

          {/* The way back. The wizard strip shows where you are but is not itself clickable,
              so before publishing this goes to step 2; once the roster is live and a seat is
              open, it goes back up to the roster the seat belongs to. */}
          {(!isPublished || hasOpen) && (
            <button
              type="button"
              onClick={() =>
                backToRoster
                  ? document.getElementById('published-roster')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  : void navigate({ to: '/assign-crew', search: windowSearch })
              }
              className="-mt-1 flex w-fit items-center gap-1.5 text-sm font-semibold text-blue-700 transition-colors hover:text-blue-800 focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
            >
              <ArrowLeftIcon className="h-4 w-4" />
              {backToRoster ? 'Published roster' : 'Assign crew'}
            </button>
          )}

          {state.loadError && (
            <p role="alert" className="rounded-lg border border-invalid/30 bg-invalid-bg px-4 py-3 text-sm font-medium text-invalid">
              {state.loadError}
            </p>
          )}

          {state.loadState === 'loading' && <p className="text-sm text-primary-text/60">Loading the roster…</p>}

          {state.loadState === 'idle' && !hasRun && (
            <section className="rounded-2xl border border-border-desc/40 bg-card-bg px-6 py-10 text-center">
              <p className="text-base font-bold text-primary-text">No roster run for this base and dates yet</p>
              <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-primary-text/60">
                Commit valid pairings in Build pairings and crew them in Assign crew first. Then the breaks that are left appear here.
              </p>
              <Button className="mt-5" onClick={() => void navigate({ to: '/build-pairings', search: windowSearch })}>
                Go to Build pairings
              </Button>
            </section>
          )}

          {/* On a phone a published roster speaks through its cards and the bottom bar, so the strip is a draft-only line there. */}
          {state.banner && (
            <div className={isPublished ? 'max-lg:hidden' : ''}>
              <NoticeStrip
                tone={state.banner.tone}
                action={
                  isPublished ? (
                    <Button variant="highlight" className="h-10 shrink-0" onClick={() => void navigate({ to: '/build-pairings' })}>
                      Start next roster run
                      <ArrowRightIcon className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Button variant="highlight" className="h-10 shrink-0 px-5" disabled={!state.canPublish} onClick={state.publish}>
                      Publish roster
                    </Button>
                  )
                }
              >
                {state.banner.text}
              </NoticeStrip>
            </div>
          )}

          {/* What the last fix did. Wide screens print it at the top of the panel; on a phone it is a strip. */}
          {state.fixNotice && hasOpen && (
            <div className="lg:hidden">
              <NoticeStrip tone="success">{state.fixNotice}</NoticeStrip>
            </div>
          )}

          {state.heading && (
            <ProgressHeader
              heading={state.heading}
              openCount={state.openBreaks.length}
              totalItems={state.totalItems}
              seatOnly={seatOnly}
              canPublish={state.canPublish}
              isPublished={isPublished}
              onPublish={state.publish}
            />
          )}

          {hasOpen && hasRun && <RulesStrip limits={state.limits ?? DEFAULT_RULE_LIMITS} />}

          {/* The workspace: list on the left, fix on the right. */}
          {/* Two columns from `xl`, not `lg`: the sidebar is already taking ~260px by
              then, which leaves the fix panel roughly 260px wide — too narrow for the
              facts table and the candidate cards. Between `lg` and `xl` the two stack;
              below `lg` the list collapses into chips and the panel drops its facts table. */}
          {hasOpen && (
            <>
              {/* The fix panel sets the row's height and the left column fits it: the column sits in an absolutely placed box, so
                  however many breaks there are it adds nothing to the row. The rules card keeps its own height and the list
                  takes what is left, scrolling inside it. The minimum keeps the list usable beside a short panel. */}
              <div className="hidden gap-6 xl:grid xl:min-h-[46rem] xl:grid-cols-[minmax(0,21rem)_minmax(0,1fr)]">
                <div className="relative min-w-0">
                  <div className="absolute inset-0 flex flex-col gap-4">
                    <BreakList
                      fill
                      breaks={state.breaks}
                      selectedId={state.selectedBreak?.id ?? null}
                      onSelect={state.selectBreak}
                      title={isPublished ? 'Open seats' : 'Rule breaks'}
                    />
                    <SeatRules />
                  </div>
                </div>
                <FixPanel {...panelProps} notice={state.fixNotice} />
              </div>

              <div className="hidden w-full flex-col gap-4 lg:flex xl:hidden">
                <BreakList
                  breaks={state.breaks}
                  selectedId={state.selectedBreak?.id ?? null}
                  onSelect={state.selectBreak}
                  title={isPublished ? 'Open seats' : 'Rule breaks'}
                />
                <SeatRules />
                <FixPanel {...panelProps} notice={state.fixNotice} />
              </div>

              <div className="flex w-full flex-col gap-4 lg:hidden">
                <BreakChips
                  breaks={state.breaks}
                  selectedId={state.selectedBreak?.id ?? null}
                  isPublished={isPublished}
                  onSelect={state.selectBreak}
                />
                <FixPanel {...panelProps} compact />
              </div>
            </>
          )}

          {isPublished && (
            <RosterTable
              assignments={state.assignments}
              openBreaks={state.openBreaks}
              updated={state.isUpdated}
              onSickCall={(legId) => {
                const assignment = state.rosterFor(legId)
                if (assignment) setPicking(assignment)
              }}
              onFindCover={state.coverLeg}
            />
          )}

          {!isPublished && !hasOpen && closed.length > 0 && <ClosedList breaks={closed} rosterFor={state.rosterFor} />}

          <PublishChecks
            checks={state.publishChecks}
            openBreaks={state.openBreaks}
            overriddenCount={closed.filter((item) => item.resolution?.kind === 'overridden').length}
            isPublished={isPublished}
          />

          {hasRun && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-border-desc/60 px-5 py-4">
              <p className="text-xs leading-relaxed text-primary-text/60">
                Did Flight Scheduling (Feature 2) move or cancel a flight? Re-read the schedule and re-check every rule against the roster.
              </p>
              <Button variant="outline" disabled={state.isBusy} onClick={state.recheck}>
                Re-check roster
              </Button>
            </div>
          )}
        </main>

        <MobileBottomBar
          openCount={state.openBreaks.length}
          isPublished={isPublished}
          canPublish={state.canPublish}
          onBack={() => void navigate({ to: '/assign-crew', search: windowSearch })}
          onPublish={state.publish}
          onNextRun={() => void navigate({ to: '/build-pairings' })}
        />
      </div>

      {overriding && (
        <OverrideModal
          item={overriding}
          rosterFor={state.rosterFor}
          onCancel={() => setOverriding(null)}
          onConfirm={(reason) => {
            state.overrideBreak(overriding.id, reason)
            setOverriding(null)
          }}
        />
      )}

      {picking && (
        <SickCallModal assignment={picking} onCancel={() => setPicking(null)} onConfirm={(memberId) => pickAbsent(picking, memberId)} />
      )}

      {removing && (
        <RemoveMemberModal
          assignment={removing.assignment}
          memberId={removing.memberId}
          onCancel={() => setRemoving(null)}
          onConfirm={(reason) => {
            state.raiseSickCall(removing.assignment.leg.legId, removing.memberId, reason)
            setRemoving(null)
          }}
        />
      )}
    </div>
  )
}

/**
 * Fixed bottom bar.
 *
 * Mirrors step 2's bar so the two steps feel like one wizard. Before publishing the action is
 * Publish, and the label counts what is still in the way; once the roster is live the step is
 * done and the action is the next run.
 */
function MobileBottomBar({
  openCount,
  isPublished,
  canPublish,
  onBack,
  onPublish,
  onNextRun,
}: {
  openCount: number
  isPublished: boolean
  canPublish: boolean
  onBack: () => void
  onPublish: () => void
  onNextRun: () => void
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 bg-primary px-4 py-3 text-white lg:hidden">
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold tracking-widest text-white/60 uppercase">{isPublished ? 'Done' : 'Next step'}</p>
        <p className="truncate text-sm font-semibold">
          {isPublished ? 'Roster published' : `${openCount} open ${openCount === 1 ? 'break' : 'breaks'}`}
        </p>
      </div>
      <button
        type="button"
        onClick={onBack}
        aria-label="Back to Assign crew"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-white/30 text-white transition-colors hover:bg-white/10"
      >
        <ChevronLeftIcon className="h-5 w-5" />
      </button>
      {isPublished ? (
        <button
          type="button"
          onClick={onNextRun}
          className="flex h-11 shrink-0 items-center gap-2 rounded-lg bg-btn-yellow px-4 text-sm font-bold text-primary-text transition-colors hover:bg-btn-yellow-hover"
        >
          Start next run
          <ArrowRightIcon className="h-4 w-4" />
        </button>
      ) : (
        <button
          type="button"
          onClick={onPublish}
          disabled={!canPublish}
          className="h-11 shrink-0 rounded-lg bg-btn-yellow px-4 text-sm font-bold text-primary-text transition-colors hover:bg-btn-yellow-hover disabled:cursor-not-allowed disabled:bg-white/15 disabled:text-white/50"
        >
          Publish roster
        </button>
      )}
    </div>
  )
}

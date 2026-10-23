/**
 * Fix & Publish — step 3 of the roster run wizard.
 *
 * Page composition only, the same split as step 2: selection and results live in
 * `use-fix-publish`, the sentences live in `break-descriptions`, the candidate rules
 * in `replacement-pool`, and the styles in the shared `tokens.css`. Replacing the mock
 * data with the backend should not require editing this file beyond the hook's
 * internals.
 *
 * The layout is a two-column workspace above `xl` — breaks on the left, the fix for
 * the selected break on the right — because fixing is a loop between the two and making
 * either one scroll away breaks it. Below `xl` they stack and the primary action moves
 * into a fixed bottom bar.
 */
import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useAppAuth } from '../../../auth/AuthProvider'
import { MOCK_SIMULATION_CLOCK } from '../assign-crew/types/mock-data'
import { MobileTopBar } from '../assign-crew/components/mobile-chrome'
import { MOCK_ROSTER_RUN } from '../build-pairings/types/mock-data'
import { RosterRunBadge, SidebarNav, WizardSteps } from '../build-pairings/components/app-shell'
import { AlertBanner, ArrowLeftIcon, Button, ChevronLeftIcon } from '../shared/ui'
import { BreakList } from './components/break-list'
import { ClosedList } from './components/closed-list'
import { FixPanel } from './components/fix-panel'
import { ProgressHeader } from './components/progress-header'
import { PublishChecks } from './components/publish-checks'
import { RosterTable } from './components/roster-table'
import { RulesStrip } from './components/rules-strip'
import { OverrideModal } from './modals/override-modal'
import { RemoveMemberModal } from './modals/remove-member-modal'
import { SickCallModal } from './modals/sick-call-modal'
import { useFixPublish } from './types/use-fix-publish'
import type { FixBreak, LegAssignment } from './types/types'

/** `Mon 14 Sep 2026 · 09:00` shortened for the mobile top bar. */
const SHORT_CLOCK = MOCK_SIMULATION_CLOCK.replace(/^\w{3}\s/, '')
  .split(' · ')[0]
  .replace(/\s\d{4}$/, '')

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
  const isPublished = state.status === 'published'
  const seatOnly = state.openBreaks.every((item) => item.code === 'SICK_CALL')

  // The Feature 2 trigger acts on the leg carrying the rest break, because that is the
  // one a two-hour delay actually reaches. It is a demo affordance, so it sits in the
  // chrome rather than pretending to be part of the fix flow.
  const delayTarget = state.assignments.find((assignment) => assignment.leg.flightNumber === 'FD511') ?? state.assignments[0]

  function pickAbsent(assignment: LegAssignment, memberId: string) {
    setPicking(null)
    setRemoving({ assignment, memberId })
  }

  return (
    <div className="flex min-h-screen w-full bg-page-bg">
      <div className="hidden lg:contents">
        <SidebarNav activeItem="roster-runs" simulationClock={MOCK_SIMULATION_CLOCK} userName={role.full} onSignOut={() => void logout()} />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <MobileTopBar simulationClockShort={SHORT_CLOCK} accountLabel={role.short} />

        <main className="flex min-w-0 flex-1 flex-col gap-5 px-4 pt-5 pb-28 lg:px-8 lg:py-7 lg:pb-8">
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-primary-text uppercase lg:text-3xl">Fix &amp; publish</h1>
              <p className="mt-1 max-w-3xl text-sm leading-relaxed text-primary-text/60">
                Fix each rule break, then publish the roster. Law rules must be fixed; company rules can be overridden with a reason.
              </p>
            </div>
            <div className="hidden lg:block">
              <RosterRunBadge
                base={MOCK_ROSTER_RUN.base}
                dateFrom={MOCK_ROSTER_RUN.dateFrom}
                dateTo={MOCK_ROSTER_RUN.dateTo}
                status={state.rosterStatusLabel}
              />
            </div>
          </header>

          <WizardSteps active="fix-publish" allDone={isPublished && state.openBreaks.length === 0} />

          {/* The way back to step 2. The wizard strip shows where you are but is not
              itself clickable, so without this the only route back is the sidebar. */}
          <button
            type="button"
            onClick={() => void navigate({ to: '/assign-crew' })}
            className="-mt-1 flex w-fit items-center gap-1.5 text-sm font-semibold text-blue-700 transition-colors hover:text-blue-800 focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            Assign crew
          </button>

          {state.banner && (
            <AlertBanner
              tone={state.banner.tone}
              action={
                isPublished ? (
                  <Button variant="highlight" className="shrink-0" onClick={() => void navigate({ to: '/build-pairings' })}>
                    Start next roster run →
                  </Button>
                ) : (
                  <Button variant="highlight" className="shrink-0" disabled={!state.canPublish} onClick={state.publish}>
                    Publish roster
                  </Button>
                )
              }
            >
              {state.banner.text}
            </AlertBanner>
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

          <RulesStrip />

          {/* The workspace: list on the left, fix on the right. */}
          {/* Two columns from `xl`, not `lg`: the sidebar is already taking ~260px by
              then, which leaves the fix panel roughly 260px wide — too narrow for the
              facts table and the candidate cards. Between `lg` and `xl` the two stack,
              which is why this and the block below share one breakpoint. */}
          <div className="hidden gap-6 xl:grid xl:grid-cols-[minmax(0,21rem)_minmax(0,1fr)] xl:items-start">
            <BreakList
              breaks={state.breaks}
              selectedId={state.selectedBreak?.id ?? null}
              onSelect={state.selectBreak}
              title={isPublished ? 'Open seats' : 'Rule breaks'}
            />
            <FixPanel item={state.selectedBreak} onOverride={setOverriding} onSwap={state.swapIn} />
          </div>

          <div className="flex w-full flex-col gap-4 xl:hidden">
            <BreakList
              breaks={state.breaks}
              selectedId={state.selectedBreak?.id ?? null}
              onSelect={state.selectBreak}
              title={isPublished ? 'Open seats' : 'Rule breaks'}
            />
            <FixPanel item={state.selectedBreak} onOverride={setOverriding} onSwap={state.swapIn} />
          </div>

          {isPublished && (
            <RosterTable
              assignments={state.assignments}
              uncoveredLegIds={state.uncoveredLegIds}
              updated={state.isUpdated}
              onSickCall={(legId) => {
                const assignment = state.rosterFor(legId)
                if (assignment) setPicking(assignment)
              }}
              onFindCover={(legId) => {
                const call = state.sickCalls.find((item) => item.legId === legId && item.replacementId === undefined)
                if (call) state.selectBreak(call.id)
              }}
            />
          )}

          {closed.length > 0 && <ClosedList breaks={closed} rosterFor={state.rosterFor} />}

          <PublishChecks
            checks={state.publishChecks}
            openCount={state.openBreaks.length}
            overriddenCount={closed.filter((item) => item.resolution?.kind === 'overridden').length}
            isPublished={isPublished}
          />

          {!isPublished && delayTarget && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-border-desc/60 px-5 py-4">
              <p className="text-xs leading-relaxed text-primary-text/60">
                Demo: push {delayTarget.leg.flightNumber} two hours later, the way Feature 2 would, and watch the affected legs re-check.
              </p>
              <Button
                variant="outline"
                disabled={state.delayedLegId === delayTarget.leg.flightId}
                onClick={() => state.delayFlight(delayTarget.leg.flightId)}
              >
                {state.delayedLegId === delayTarget.leg.flightId ? 'Delay applied' : `Delay ${delayTarget.leg.flightNumber} +2 h`}
              </Button>
            </div>
          )}
        </main>

        <MobileBottomBar
          openCount={state.openBreaks.length}
          isPublished={isPublished}
          canPublish={state.canPublish}
          onBack={() => void navigate({ to: '/assign-crew' })}
          onPublish={state.publish}
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
            state.raiseSickCall(removing.assignment.leg.flightId, removing.memberId, reason)
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
 * Mirrors step 2's bar so the two steps feel like one wizard, but the action is
 * Publish rather than "next step" — this is the last one, and the button states the
 * count of what is still in the way.
 */
function MobileBottomBar({
  openCount,
  isPublished,
  canPublish,
  onBack,
  onPublish,
}: {
  openCount: number
  isPublished: boolean
  canPublish: boolean
  onBack: () => void
  onPublish: () => void
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 bg-primary px-4 py-3 text-white lg:hidden">
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold tracking-widest text-white/50 uppercase">Status</p>
        <p className="truncate text-sm font-medium">
          {isPublished
            ? 'Roster published'
            : openCount === 0
              ? 'Ready to publish'
              : `${openCount} ${openCount === 1 ? 'break' : 'breaks'} to fix`}
        </p>
      </div>
      <button
        type="button"
        onClick={onBack}
        aria-label="Back to Assign crew"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-white/25 text-white transition-colors hover:bg-white/10"
      >
        <ChevronLeftIcon className="h-5 w-5" />
      </button>
      <button
        type="button"
        onClick={onPublish}
        disabled={!canPublish || isPublished}
        className="shrink-0 rounded-lg bg-btn-yellow px-4 py-3 text-sm font-semibold text-primary-text transition-colors hover:bg-btn-yellow-hover disabled:cursor-not-allowed disabled:bg-white/15 disabled:text-white/50"
      >
        {isPublished ? 'Published' : 'Publish'}
      </button>
    </div>
  )
}

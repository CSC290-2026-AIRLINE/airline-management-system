/**
 * Published rosters — every roster that has gone live, round by round.
 *
 * Reached from a button on Build pairings, not from the sidebar. A published roster stays editable through sick calls, so
 * this is where an operator comes back to a past round: rounds are grouped by the day they were published, newest first,
 * and each card opens to the same published-roster table Fix & publish shows. Raising a sick call takes the person off
 * and hands over to the Fix & publish workspace, which finds the cover.
 */
import { Fragment, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { formatDateRange, formatFullDay, formatTime } from '../build-pairings/types/format'
import { RosterTable } from '../fix-publish/components/roster-table'
import { RemoveMemberModal } from '../fix-publish/modals/remove-member-modal'
import { SickCallModal } from '../fix-publish/modals/sick-call-modal'
import type { LegAssignment, PublishedRunSummary } from '../fix-publish/types/types'
import { ArrowLeftIcon, ArrowRightIcon, Button, EmptyFaceIcon } from '../shared/ui'
import { usePublishedRosters, type RosterLoad } from './types/use-published-rosters'

interface Round {
  run: PublishedRunSummary
  /** 1 for the first roster published for this base and window, 2 for the next, and so on. */
  round: number
}

/** Rounds, newest first, split into one group per day they were published. */
function groupByDay(runs: readonly PublishedRunSummary[]): { label: string; rounds: Round[] }[] {
  const seen = new Map<string, number>()
  const numbered = new Map<string, number>()
  // Oldest first, so the first roster published for a window is round 1.
  for (const run of [...runs].sort((a, b) => (a.publishedAt ?? '').localeCompare(b.publishedAt ?? ''))) {
    const key = `${run.base}|${run.dateFrom}|${run.dateTo}`
    const next = (seen.get(key) ?? 0) + 1
    seen.set(key, next)
    numbered.set(run.id, next)
  }

  const groups: { label: string; rounds: Round[] }[] = []
  for (const run of runs) {
    const label = run.publishedAt ? formatFullDay(run.publishedAt) : 'Publish date unknown'
    const round = { run, round: numbered.get(run.id) ?? 1 }
    const last = groups[groups.length - 1]
    if (last && last.label === label) last.rounds.push(round)
    else groups.push({ label, rounds: [round] })
  }
  return groups
}

export function PublishedRostersPage() {
  const state = usePublishedRosters()
  const navigate = useNavigate()
  const [picking, setPicking] = useState<{ runId: string; assignment: LegAssignment } | null>(null)
  const [removing, setRemoving] = useState<{ runId: string; assignment: LegAssignment; memberId: string } | null>(null)

  const openFix = (run: PublishedRunSummary, fix: boolean) =>
    void navigate({
      to: '/fix-publish',
      search: { runId: run.id, dateFrom: run.dateFrom, dateTo: run.dateTo, base: run.base, ...(fix ? { fix } : {}) },
    })

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex min-w-0 flex-1 flex-col gap-5 px-4 pt-1 pb-8 lg:px-9 lg:py-7 lg:pb-9">
        <button
          type="button"
          onClick={() => void navigate({ to: '/build-pairings' })}
          className="flex w-fit items-center gap-1.5 text-sm font-semibold text-blue-700 transition-colors hover:text-blue-800 focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 max-lg:mt-4"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Build pairings
        </button>

        <header>
          <h1 className="text-2xl font-extrabold tracking-tight text-primary-text uppercase lg:text-3xl">Published rosters</h1>
          <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-primary-text/60 lg:text-base">
            Every roster that has gone live, newest first. Open a round to look at the crew, or raise a sick call on a leg that has not
            flown yet.
          </p>
        </header>

        {state.loadState === 'loading' && <p className="text-sm text-primary-text/60">Loading the published rosters…</p>}

        {state.loadState === 'error' && (
          <p role="alert" className="rounded-lg border border-invalid/30 bg-invalid-bg px-4 py-3 text-sm font-medium text-invalid">
            {state.loadError ?? 'Could not load the published rosters.'}
          </p>
        )}

        {state.actionError && (
          <p role="alert" className="rounded-lg border border-invalid/30 bg-invalid-bg px-4 py-3 text-sm font-medium text-invalid">
            {state.actionError}
          </p>
        )}

        {state.loadState === 'ready' && state.runs.length === 0 && (
          <section className="flex flex-col items-center rounded-2xl border border-border-desc/40 bg-card-bg px-6 py-14 text-center">
            <EmptyFaceIcon className="h-12 w-12 text-slate" />
            <p className="mt-4 text-base font-bold text-primary-text">No published rosters yet</p>
            <p className="mt-1 max-w-sm text-sm leading-relaxed text-primary-text/60">
              A roster appears here once it is published from Fix &amp; publish.
            </p>
            <Button className="mt-5" onClick={() => void navigate({ to: '/build-pairings' })}>
              Go to Build pairings
            </Button>
          </section>
        )}

        {groupByDay(state.runs).map((group) => (
          <section key={group.label} aria-label={`Published ${group.label}`} className="flex flex-col gap-3">
            <h2 className="text-sm font-bold tracking-wide text-primary-text/70">Published {group.label}</h2>
            <ul className="flex flex-col gap-4">
              {group.rounds.map(({ run, round }) => (
                <li key={run.id}>
                  <RoundCard
                    run={run}
                    round={round}
                    open={state.expanded.has(run.id)}
                    roster={state.rosters.get(run.id)}
                    onToggle={() => state.toggle(run.id)}
                    onOpen={() => openFix(run, false)}
                    onFindCover={() => openFix(run, true)}
                    onSickCall={(assignment) => setPicking({ runId: run.id, assignment })}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {picking && (
        <SickCallModal
          assignment={picking.assignment}
          onCancel={() => setPicking(null)}
          onConfirm={(memberId) => {
            setRemoving({ ...picking, memberId })
            setPicking(null)
          }}
        />
      )}

      {removing && (
        <RemoveMemberModal
          assignment={removing.assignment}
          memberId={removing.memberId}
          onCancel={() => setRemoving(null)}
          onConfirm={(reason) => {
            const target = removing
            void state.raiseSickCall(target.runId, target.assignment.leg.legId, target.memberId, reason).then((done) => {
              setRemoving(null)
              const run = state.runs.find((item) => item.id === target.runId)
              if (done && run) openFix(run, true)
            })
          }}
        />
      )}
    </div>
  )
}

function RoundCard({
  run,
  round,
  open,
  roster,
  onToggle,
  onOpen,
  onFindCover,
  onSickCall,
}: {
  run: PublishedRunSummary
  round: number
  open: boolean
  roster: RosterLoad | undefined
  onToggle: () => void
  onOpen: () => void
  onFindCover: () => void
  onSickCall: (assignment: LegAssignment) => void
}) {
  const bodyId = `round-${run.id}`
  return (
    <article className="rounded-2xl border border-border-desc/40 bg-card-bg p-5 lg:p-6">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h3 className="text-lg font-extrabold tracking-tight text-primary-text lg:text-xl">
            {run.base} · {formatDateRange(run.dateFrom, run.dateTo)}
            <span className="ml-2.5 rounded-full bg-info-bg px-2.5 py-0.5 align-middle text-[11px] font-bold text-blue-700">
              Round {round}
            </span>
          </h3>
          <p className="mt-1 text-sm text-primary-text/60">
            {run.publishedAt ? `Published ${formatTime(run.publishedAt)}` : 'Published'} · {run.pairings}{' '}
            {run.pairings === 1 ? 'pairing' : 'pairings'} · {run.legs} {run.legs === 1 ? 'leg' : 'legs'}
          </p>
          <p className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-bold">
            {run.fixed > 0 && <span className="rounded-full bg-valid-bg px-2.5 py-0.5 text-valid">{run.fixed} fixed</span>}
            {run.overridden > 0 && (
              <span className="rounded-full bg-amber-tint px-2.5 py-0.5 text-amber-ink">{run.overridden} overridden</span>
            )}
            {run.open > 0 && <span className="rounded-full bg-invalid-bg px-2.5 py-0.5 text-invalid">{run.open} open</span>}
            {run.fixed + run.overridden + run.open === 0 && (
              <span className="rounded-full bg-page-bg px-2.5 py-0.5 text-primary-text/60">No breaks</span>
            )}
          </p>
        </div>

        <div className="flex w-full gap-2 sm:w-auto">
          <Button variant="outline" className="h-10 flex-1 sm:flex-none" onClick={onToggle} aria-expanded={open} aria-controls={bodyId}>
            {open ? 'Hide roster' : 'Show roster'}
          </Button>
          <Button className="h-10 flex-1 sm:flex-none" onClick={onOpen}>
            Open
            <ArrowRightIcon className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {open && (
        <div id={bodyId} className="mt-5 border-t border-border-desc/40 pt-5">
          {(roster === undefined || roster.state === 'loading') && <p className="text-sm text-primary-text/60">Loading the roster…</p>}
          {roster?.state === 'error' && (
            <p role="alert" className="text-sm font-medium text-invalid">
              {roster.message}
            </p>
          )}
          {roster?.state === 'ready' && (
            <Fragment>
              <RosterTable
                embedded
                assignments={roster.data.assignments}
                openBreaks={roster.data.breaks.filter((item) => item.resolution === undefined)}
                updated={false}
                onSickCall={(legId) => {
                  const assignment = roster.data.assignments.find((item) => item.leg.legId === legId)
                  if (assignment) onSickCall(assignment)
                }}
                onFindCover={onFindCover}
              />
            </Fragment>
          )}
        </div>
      )}
    </article>
  )
}

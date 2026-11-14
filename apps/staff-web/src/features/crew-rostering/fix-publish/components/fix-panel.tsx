/**
 * The panel that fixes the selected break.
 *
 * It reads top to bottom as an argument: what the break is, why the roster is not
 * legal, the numbers behind that claim, then what to do about it. Every sentence about the
 * break comes from the backend rather than being written here, so the panel and the list
 * on the left cannot describe the same break two different ways. The only sentences written
 * here are the ones describing what pressing Apply is about to do, which the backend does
 * not know until the operator has picked somebody.
 *
 * `compact` is the phone layout: no facts table or apply summary, shorter candidate cards.
 */
import { useState, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { Button, CheckIcon, EmptyFaceIcon } from '../../shared/ui'
import { ROLE_LABELS, crewOn, languageName } from '../types/labels'
import { ReplacementPicker } from './replacement-picker'
import type { FixBreak, LegAssignment, RosterFact } from '../types/types'

interface FixPanelProps {
  item: FixBreak | null
  /** The green sentence describing the fix that was just applied, shown above the next item. */
  notice?: string | null
  compact?: boolean
  /** The roster's base, printed under each candidate. */
  base: string
  /** Breaks still open, for the "remaining after this fix" line. */
  openCount: number
  rosterFor: (legId: string) => LegAssignment | undefined
  isBusy: boolean
  /** Company-rule breaks only. Law rules have no override, so the button is absent. */
  onOverride: (item: FixBreak) => void
  onSwap: (breakId: string, candidateIds: readonly string[]) => void
  /** The roster is live, so an empty seat with nobody legal can be left uncovered. */
  isPublished?: boolean
  onLeaveUncovered?: () => void
}

export function FixPanel({
  item,
  notice,
  compact = false,
  base,
  openCount,
  rosterFor,
  isBusy,
  onOverride,
  onSwap,
  isPublished = false,
  onLeaveUncovered,
}: FixPanelProps) {
  // Which candidate the operator picked, and for which item, so a pick never carries over to the next one.
  const [pick, setPick] = useState<{ itemId: string; ids: string[] } | null>(null)

  if (!item) {
    return (
      <section className="flex flex-col items-center justify-center rounded-2xl border border-border-desc/40 bg-card-bg px-6 py-16 text-center">
        <EmptyFaceIcon className="h-12 w-12 text-slate" />
        <p className="mt-4 text-sm font-bold text-primary-text">Nothing selected</p>
        <p className="mt-1 max-w-xs text-sm leading-relaxed text-primary-text/60">
          Pick a break on the left to see why it is open and who can take the seat.
        </p>
      </section>
    )
  }

  const closed = item.resolution !== undefined
  const set = item.replacement
  const assignment = rosterFor(item.legId)
  // Nothing picked yet means the first legal candidate(s): as many as the break is short, so the common case is one click.
  const seats = Math.max(1, set?.seatsToFill ?? 1)
  const legalIds = set?.candidates.filter((candidate) => candidate.allowed).map((candidate) => candidate.member.id) ?? []
  const chosenIds = (pick?.itemId === item.id ? pick.ids : legalIds.slice(0, seats)).filter((id) => legalIds.includes(id))
  const chosen = set?.candidates.filter((candidate) => chosenIds.includes(candidate.member.id)) ?? []
  const canSwap = !closed && chosen.length > 0

  function choose(candidateId: string) {
    if (!item) return
    const current = chosenIds
    const next =
      seats <= 1
        ? [candidateId]
        : current.includes(candidateId)
          ? current.filter((id) => id !== candidateId)
          : current.length < seats
            ? [...current, candidateId]
            : current
    setPick({ itemId: item.id, ids: next })
  }

  // A live roster with an empty seat and nobody legal to put in it: the only move is to leave the leg uncovered.
  const leaveUncovered = !closed && isPublished && !!onLeaveUncovered && item.code === 'NO_LEGAL_CREW' && (set?.allowedCount ?? 0) === 0

  return (
    <section
      aria-label={`Fix ${item.code}`}
      className={`rounded-2xl border border-border-desc/40 bg-card-bg ${compact ? 'p-5' : 'p-5 sm:p-6 xl:p-7'}`}
    >
      {!compact && notice && (
        // The tick and the green text: this one reports good news, and a sentence about a break
        // being fixed has nothing to apologise for.
        <p
          role="status"
          className="mb-6 flex items-start gap-2 rounded-lg border border-green-line bg-green-tint px-4 py-2.5 text-sm font-semibold text-valid"
        >
          <CheckIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{notice}</span>
        </p>
      )}

      {!compact && <p className="text-[11px] font-bold tracking-widest text-primary/45 uppercase">Fixing</p>}
      <h2 className={`font-extrabold tracking-tight text-primary-text ${compact ? 'text-2xl' : 'mt-1 text-3xl'}`}>{item.title}</h2>
      <p className="mt-1 text-sm break-words text-primary-text/55">{item.context}</p>

      {closed && item.resolution ? (
        <div className="mt-4 rounded-lg border border-green-line bg-green-tint px-4 py-3">
          <p className="flex items-start gap-2 text-sm leading-relaxed font-semibold text-valid">
            <CheckIcon className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{item.resolution.banner}</span>
          </p>
          {item.resolution.reason && (
            <p className="mt-2 border-t border-green-line pt-2 text-sm text-primary-text/70">Reason on file: “{item.resolution.reason}”</p>
          )}
        </div>
      ) : (
        // No icon: this box is the rule explaining itself, and an alert glyph next to a sentence that
        // already names the code says the same thing twice.
        <div
          className={`mt-4 rounded-lg border border-invalid/25 bg-invalid/5 px-4 py-3.5 ${compact ? 'text-invalid' : 'text-primary-text'}`}
        >
          <p className="text-sm leading-relaxed">{item.explanation}</p>
        </div>
      )}

      {!compact && (
        <>
          <SectionLabel>What the roster has now</SectionLabel>
          <dl className="mt-1">
            {item.facts.map((fact) => (
              <FactRow key={fact.label} fact={fact} />
            ))}
          </dl>
        </>
      )}

      {!closed && set && (
        <div className={compact ? 'mt-5' : 'mt-7'}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <SectionLabel plain>{compact ? 'Choose a replacement' : 'Replace with'}</SectionLabel>
            {!compact && <span className="text-sm text-primary-text/55">{set.availableLabel}</span>}
          </div>
          {/* With nobody to offer, the picker prints its own blocked note; a second sentence asking
              for a swap that cannot happen would only argue with it. */}
          {!compact && set.candidates.length > 0 && <p className="mt-2 text-sm leading-relaxed text-primary-text/70">{set.instruction}</p>}
          {set.seatsToFill > 1 && set.allowedCount > 0 && (
            <p className="mt-2 text-sm leading-relaxed font-semibold text-primary-text/80">
              {seatName(item)} is short {set.seatsToFill}. Pick up to {Math.min(set.seatsToFill, set.allowedCount)} and add them together;
              each one is checked against the rules before it goes on.
            </p>
          )}
          <ReplacementPicker item={item} chosenIds={chosenIds} onChoose={choose} base={base} leg={assignment?.leg} compact={compact} />
        </div>
      )}

      {!closed && set && set.allowedCount === 0 && <NobodyLegal item={item} base={base} compact={compact} />}

      {!compact && canSwap && (
        <ApplySummary
          item={item}
          assignment={assignment}
          candidates={chosen.map((candidate) => candidate.member)}
          seats={seats}
          openCount={openCount}
        />
      )}

      {!compact && leaveUncovered && <UncoveredSummary item={item} />}

      {leaveUncovered && (
        <div className={compact ? 'mt-5' : 'mt-6'}>
          <p className="text-xs leading-relaxed text-primary-text/55">
            {compact
              ? `No legal ${seatName(item)}. ${item.flightNumber} is marked Uncovered; Feature 2 sees it in its impact preview.`
              : 'No legal replacement. Ops can leave the leg uncovered and come back later.'}
          </p>
          <div className={`mt-3 flex ${compact ? 'flex-col' : 'justify-end'}`}>
            <Button className={`h-11 ${compact ? 'w-full' : 'px-6'}`} disabled={isBusy} onClick={onLeaveUncovered}>
              Leave {item.flightNumber} uncovered
            </Button>
          </div>
        </div>
      )}

      {!closed && !leaveUncovered && (
        <div className={compact ? 'mt-5' : 'mt-6'}>
          <p className="text-xs leading-relaxed text-primary-text/55">{footnote(item)}</p>
          <div className={`mt-3 flex gap-3 ${compact ? 'flex-col' : 'flex-wrap justify-end'}`}>
            {item.severity === 'company' && (
              <Button
                variant={canSwap ? 'outline' : 'primary'}
                className={`h-11 ${compact ? 'w-full' : 'px-6'}`}
                disabled={isBusy}
                onClick={() => onOverride(item)}
              >
                Override with reason
              </Button>
            )}
            {canSwap && (
              <Button
                className={`h-11 ${compact ? 'order-first w-full' : 'px-6'}`}
                disabled={isBusy}
                onClick={() => onSwap(item.id, chosenIds)}
              >
                {swapLabel(
                  item,
                  chosen.map((candidate) => candidate.member.name),
                )}
              </Button>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

/** What the button says: adding people to a leg, swapping one onto it, or swapping one in for another. */
function swapLabel(item: FixBreak, names: string[]): string {
  if (names.length > 1) return `Add ${names.length} ${seatName(item, true)} to ${item.flightNumber}`
  const [name] = names
  if (item.removed || item.code === 'POLICE_MIN' || item.code === 'NO_LEGAL_CREW') return `Add ${name} to ${item.flightNumber}`
  if (item.code === 'NO_LOCAL_CREW') return `Swap ${name} onto ${item.flightNumber}`
  return `Swap in ${name}`
}

/** The small print above the buttons: what pressing them does, or why there is no override. */
function footnote(item: FixBreak): string {
  if (item.severity === 'law') return 'Law rule · this break can’t be overridden. Pick a legal replacement to fix it.'
  if (item.code === 'POLICE_NO_SEAT') {
    return 'Company rule · it closes by itself when Feature 3 gives a seat, or Ops can override it with a reason.'
  }
  return 'Nothing in the roster changes until you press Apply.'
}

/**
 * "If you apply this" — the plain-language consequence of the pick.
 *
 * Written from the break, the leg and the candidate, because the backend only knows the result
 * once the swap is made. The last line is an estimate of the open breaks left, which assumes the fix
 * closes this one and raises no new one; the backend re-checks everything when it is applied.
 */
function ApplySummary({
  item,
  assignment,
  candidates,
  seats,
  openCount,
}: {
  item: FixBreak
  assignment: LegAssignment | undefined
  candidates: { name: string; role: keyof typeof ROLE_LABELS; languages: readonly string[] }[]
  seats: number
  openCount: number
}) {
  const [first] = candidates
  const name = candidates.map((candidate) => candidate.name).join(', ')
  const flight = item.flightNumber
  const subject = assignment && item.subjectId ? crewOn(assignment).find((seat) => seat.member.id === item.subjectId) : undefined
  const recheck =
    candidates.length > 1
      ? `Re-check rest, 28-day hours and overlap for each of them.`
      : `Re-check rest, 28-day hours and overlap for ${name}.`
  // Whether this pick fills every seat the break is short; a smaller pick adds people but leaves the break open.
  const fillsIt = candidates.length >= seats
  const remaining = `Remaining open breaks after this fix: ${Math.max(openCount - (fillsIt ? 1 : 0), 0)}.`
  // "1 of 4" on the roster fact: after adding these people the leg has this many.
  const count = item.facts.map((fact) => /^(\d+) of (\d+)$/.exec(fact.value)).find((match) => match !== null)
  const after = count ? `${Number(count[1]) + candidates.length} of ${count[2]}` : null
  const seatLabel = seatName(item, candidates.length > 1)

  let title = 'If you apply this legal replacement'
  let lines: string[]
  if (item.removed) {
    title = 'If you apply this replacement'
    lines = [
      `Add ${name} as ${ROLE_LABELS[item.removed.role].toLowerCase()} on ${flight}.`,
      recheck,
      'Log the sick call and the change to the audit log (Feature 15).',
      'Crew duties are re-sent through Feature 13 (not connected yet).',
    ]
  } else if (item.code === 'POLICE_MIN' || item.code === 'NO_LEGAL_CREW') {
    lines = [
      `Add ${name} as ${seatLabel} on ${flight}.`,
      ...(after ? [`${flight} then has ${after} ${seatName(item)}.`] : []),
      recheck,
      remaining,
    ]
  } else if (item.code === 'NO_LOCAL_CREW') {
    const spoken = first?.languages.find((code) => assignment?.leg.localLanguages.includes(code))
    lines = [
      `Swap ${name} onto ${flight} as cabin crew.`,
      `${flight} then has 1 ${spoken ? languageName(spoken) : 'local-language'} speaker.`,
      recheck,
      remaining,
    ]
  } else {
    title = 'If you apply this swap'
    const seat = subject ? ROLE_LABELS[subject.role].toLowerCase() : 'seat'
    lines = [
      `Replace ${subject?.member.name ?? 'the current crew member'} with ${name} as ${seat} on ${item.pairingCode}.`,
      `${subject?.member.name ?? 'They'} comes off ${item.pairingCode} and is no longer short.`,
      recheck,
      remaining,
    ]
  }

  return (
    <div className="mt-6 rounded-xl border border-btn-yellow/60 bg-amber-tint/40 px-5 py-4">
      <p className="text-[11px] font-bold tracking-widest text-amber-ink uppercase">{title}</p>
      <ul className="mt-2.5 flex flex-col gap-1.5 text-sm text-primary-text">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {!fillsIt && (
        <p className="mt-2.5 text-xs font-semibold text-amber-ink">
          {seats - candidates.length} more {seatName(item)} still needed after this; the break stays open until the leg is full.
        </p>
      )}
    </div>
  )
}

/**
 * Nobody at the base passes every rule for this seat. Law rules cannot be overridden, so the only way out is more
 * crew (or freeing someone from another pairing): say so, and go straight to the page where crew are added.
 */
function NobodyLegal({ item, base, compact }: { item: FixBreak; base: string; compact: boolean }) {
  const seat = seatName(item)
  return (
    <div className="mt-5 flex flex-col gap-3 rounded-xl border border-border-desc/60 bg-page-bg/60 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm leading-relaxed text-primary-text/75">
        No {seat} based at {base} is free and legal for {item.flightNumber}.{' '}
        {item.severity === 'law'
          ? 'This is a law rule, so it cannot be overridden: add crew based at ' + base + ', or free one from another pairing in this run.'
          : 'Add crew based at ' + base + ', free one from another pairing, or override it with a reason.'}
        {!compact && ' New crew appear here as soon as you come back.'}
      </p>
      <Link
        to="/setup-crew"
        className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg border border-border-desc/70 bg-white px-4 text-sm font-semibold text-primary-text transition-colors hover:bg-page-bg"
      >
        Open Crew
      </Link>
    </div>
  )
}

function seatName(item: FixBreak, plural = false): string {
  const role = (item.seatRole ? ROLE_LABELS[item.seatRole] : 'crew member').toLowerCase()
  if (!plural) return role
  return item.seatRole === 'cabin_crew' ? role : item.seatRole === 'police' ? 'police officers' : `${role}s`
}

/** "What happens now" — what leaving a seat empty on a live roster does, so nobody has to guess. */
function UncoveredSummary({ item }: { item: FixBreak }) {
  const seat = seatName(item)
  const lines = [
    `${item.flightNumber} is published without a ${seat} and marked Uncovered.`,
    `The published roster shows ${item.flightNumber} as Not covered (NO_LEGAL_CREW).`,
    'Feature 2 sees it in its impact preview.',
    `Try again when a ${seat} becomes legal (for example after rest).`,
  ]
  return (
    <div className="mt-6 rounded-xl border border-btn-yellow/60 bg-amber-tint/40 px-5 py-4">
      <p className="text-[11px] font-bold tracking-widest text-amber-ink uppercase">What happens now</p>
      <ul className="mt-2.5 flex flex-col gap-1.5 text-sm text-primary-text">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  )
}

/** The small-caps headings the mockups put above each block. */
function SectionLabel({ children, plain = false }: { children: ReactNode; plain?: boolean }) {
  return (
    <p
      className={`${plain ? '' : 'mt-6 border-b border-border-desc/30 pb-2'} text-[11px] font-bold tracking-widest text-primary/50 uppercase`}
    >
      {children}
    </p>
  )
}

function FactRow({ fact }: { fact: RosterFact }) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-border-desc/25 py-3.5 last:border-b-0">
      <dt className="text-sm text-primary-text/60">{fact.label}</dt>
      <dd className={`text-right text-sm font-bold ${fact.danger ? 'text-invalid' : 'text-primary-text'}`}>{fact.value}</dd>
    </div>
  )
}

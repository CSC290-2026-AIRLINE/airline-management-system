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
  onSwap: (breakId: string, candidateId: string) => void
}

export function FixPanel({ item, notice, compact = false, base, openCount, rosterFor, isBusy, onOverride, onSwap }: FixPanelProps) {
  // Which candidate the operator picked, and for which item, so a pick never carries over to the next one.
  const [pick, setPick] = useState<{ itemId: string; candidateId: string } | null>(null)

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
  // Nothing picked yet means the first legal candidate, so the common case is one click on the apply button.
  const chosenId = pick?.itemId === item.id ? pick.candidateId : (set?.candidates.find((candidate) => candidate.allowed)?.member.id ?? null)
  const chosen = set?.candidates.find((candidate) => candidate.member.id === chosenId && candidate.allowed)
  const canSwap = !closed && chosen !== undefined

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
          <ReplacementPicker
            item={item}
            chosenId={chosenId}
            onChoose={(candidateId) => setPick({ itemId: item.id, candidateId })}
            base={base}
            leg={assignment?.leg}
            compact={compact}
          />
        </div>
      )}

      {!compact && canSwap && chosen && (
        <ApplySummary item={item} assignment={assignment} candidate={chosen.member} openCount={openCount} />
      )}

      {!closed && (
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
            {canSwap && chosen && (
              <Button
                className={`h-11 ${compact ? 'order-first w-full' : 'px-6'}`}
                disabled={isBusy}
                onClick={() => onSwap(item.id, chosen.member.id)}
              >
                {swapLabel(item, chosen.member.name)}
              </Button>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

/** What the button says: adding a person to a leg, swapping one onto it, or swapping one in for another. */
function swapLabel(item: FixBreak, name: string): string {
  if (item.removed || item.code === 'POLICE_MIN') return `Add ${name} to ${item.flightNumber}`
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
  candidate,
  openCount,
}: {
  item: FixBreak
  assignment: LegAssignment | undefined
  candidate: { name: string; role: keyof typeof ROLE_LABELS; languages: readonly string[] }
  openCount: number
}) {
  const { name } = candidate
  const flight = item.flightNumber
  const subject = assignment && item.subjectId ? crewOn(assignment).find((seat) => seat.member.id === item.subjectId) : undefined
  const recheck = `Re-check rest, 28-day hours and overlap for ${name}.`
  const remaining = `Remaining open breaks after this fix: ${Math.max(openCount - 1, 0)}.`

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
  } else if (item.code === 'POLICE_MIN') {
    const need = assignment?.policeRequired ?? 2
    lines = [`Add ${name} as police on ${flight}.`, `${flight} then has ${need} of ${need} police.`, recheck, remaining]
  } else if (item.code === 'NO_LOCAL_CREW') {
    const spoken = candidate.languages.find((code) => assignment?.leg.localLanguages.includes(code))
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

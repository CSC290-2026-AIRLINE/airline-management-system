/**
 * The candidate picker.
 *
 * Blocked candidates are listed rather than hidden. An operator who expected to see a
 * colleague and cannot is looking at the reason, not at a shorter list — and the reason
 * is usually a rule they already know (`Would exceed 100 h`, `Overlaps FD511`), which is
 * what makes the roster feel accountable rather than arbitrary.
 *
 * Selection is one step and pressing it is another. Selecting first means the operator
 * can read the candidate's checks against the one they intend to pick without the
 * roster changing under them mid-read.
 */
import { useState } from 'react'
import { Button, CheckIcon, CrossIcon } from '../../shared/ui'
import type { FixBreak, ReplacementCandidate } from '../types/types'

interface ReplacementPickerProps {
  /** The break being fixed. Carries the role, so the panel needs no extra props. */
  item: FixBreak
  onSwap: (candidateId: string) => void
}

const ROLE_LABELS: Record<FixBreak['seatRole'], string> = {
  captain: 'Captain',
  first_officer: 'First officer',
  cabin: 'Cabin crew',
  local: 'Local crew',
  police: 'Police',
}

export function ReplacementPicker({ item, onSwap }: ReplacementPickerProps) {
  const [picked, setPicked] = useState<string | null>(null)
  const set = item.replacement
  if (!set) return null

  // Nothing picked yet means the first legal candidate, so the common case is one click
  // on the swap button rather than a click on the radio as well.
  const chosen = picked ?? set.candidates.find((candidate) => candidate.allowed)?.member.id ?? null

  return (
    <section aria-label="Replacement crew" className="mt-4">
      {/* Plain text, not another red box: the panel's own box already carries the tint,
          and a second one directly below it reads as a second, separate problem. */}
      {set.allowedCount === 0 && (
        <p className="text-sm leading-relaxed text-primary-text/60">{set.blockedNote ?? 'Nobody in the pool clears every check.'}</p>
      )}

      <ul className="mt-4 flex flex-col gap-3">
        {set.candidates.map((candidate) => (
          <li key={candidate.member.id}>
            <CandidateCard
              groupName={`candidate-${item.id}`}
              candidate={candidate}
              selected={candidate.member.id === chosen}
              onSelect={() => setPicked(candidate.member.id)}
            />
          </li>
        ))}
      </ul>

      {chosen && (
        <Button className="mt-4" onClick={() => onSwap(chosen)}>
          Swap in {nameOf(set.candidates, chosen)}
        </Button>
      )}
    </section>
  )
}

function nameOf(candidates: readonly ReplacementCandidate[], memberId: string): string {
  return candidates.find((candidate) => candidate.member.id === memberId)?.member.name ?? ''
}

function CandidateCard({
  groupName,
  candidate,
  selected,
  onSelect,
}: {
  groupName: string
  candidate: ReplacementCandidate
  selected: boolean
  onSelect: () => void
}) {
  const { member, checks, allowed } = candidate
  const failures = checks.filter((check) => !check.ok)

  return (
    <article
      className={`group rounded-xl border p-4 transition-colors ${
        allowed
          ? selected
            ? 'border-primary bg-white'
            : 'border-border-desc/40 bg-white hover:border-primary/40'
          : 'border-border-desc/25 bg-primary/3'
      }`}
    >
      <div className="flex items-start gap-3">
        <input
          type="radio"
          name={groupName}
          checked={selected && allowed}
          disabled={!allowed}
          onChange={onSelect}
          aria-label={`Select ${member.name}`}
          className="mt-1 h-4 w-4 shrink-0 accent-btn-navy disabled:opacity-40"
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="text-sm font-bold text-primary-text">{member.name}</p>
            <StatePill allowed={allowed} selected={selected && allowed} />
          </div>
          <p className="mt-0.5 text-xs text-primary-text/60">
            {ROLE_LABELS[member.role]} · {member.nationality}
          </p>

          <ul className="mt-2.5 flex flex-wrap gap-1.5">
            {checks.map((check) => (
              <li
                key={check.label}
                className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold ${
                  check.ok ? 'bg-valid/10 text-valid' : 'bg-invalid/10 text-invalid'
                }`}
              >
                {check.ok ? <CheckIcon className="h-3 w-3" /> : <CrossIcon className="h-3 w-3" />}
                {check.label}
              </li>
            ))}
          </ul>

          {failures.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1">
              {failures.map((check) => (
                <li key={check.label} className="text-xs text-invalid/90">
                  {check.reason ?? check.label}
                </li>
              ))}
            </ul>
          )}

          {allowed && (
            // Shown on hover and on keyboard focus, so it is reachable either way.
            <p
              role="tooltip"
              className="mt-2 text-[11px] text-primary-text/50 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
            >
              Select {member.name} · then press the swap button
            </p>
          )}
        </div>
      </div>
    </article>
  )
}

/** `[Selected]` on the candidate about to go on, `[Not allowed]` on the blocked ones. */
function StatePill({ allowed, selected }: { allowed: boolean; selected: boolean }) {
  if (!allowed) return <span className="rounded-full bg-invalid/10 px-2 py-0.5 text-[11px] font-bold text-invalid">Not allowed</span>
  if (!selected) return null
  return <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-white">Selected</span>
}

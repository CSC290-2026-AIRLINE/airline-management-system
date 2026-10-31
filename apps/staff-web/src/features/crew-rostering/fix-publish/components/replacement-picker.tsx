/**
 * The candidate picker.
 *
 * Blocked candidates are listed rather than hidden. An operator who expected to see a
 * colleague and cannot is looking at the reason, not at a shorter list — and the reason
 * is usually a rule they already know (`Would exceed 100 h`, `Overlaps FD511`), which is
 * what makes the roster feel accountable rather than arbitrary.
 *
 * Selection is controlled by the panel, which needs the chosen name for the apply summary
 * and the button. Selecting is one step and pressing the button is another, so the operator can
 * read a candidate's checks against the one they intend to pick without the roster changing.
 */
import { CheckIcon, CrossIcon } from '../../shared/ui'
import { ROLE_LABELS, languageName } from '../types/labels'
import type { RosterLeg } from '../../assign-crew/types/types'
import type { FixBreak, ReplacementCandidate } from '../types/types'

interface ReplacementPickerProps {
  /** The break being fixed. Carries the role, so the panel needs no extra props. */
  item: FixBreak
  chosenId: string | null
  onChoose: (candidateId: string) => void
  base: string
  /** The leg being crewed, to name the language a local-crew candidate speaks. */
  leg?: RosterLeg
  /** The phone layout: shorter cards, a `Best match` tag and blocked cards faded. */
  compact?: boolean
}

export function ReplacementPicker({ item, chosenId, onChoose, base, leg, compact = false }: ReplacementPickerProps) {
  const set = item.replacement
  if (!set) return null
  const bestId = set.candidates.find((candidate) => candidate.allowed)?.member.id

  return (
    <section aria-label="Replacement crew" className="mt-4">
      {/* Plain text, not another red box: the panel's own box already carries the tint,
          and a second one directly below it reads as a second, separate problem. */}
      {set.allowedCount === 0 && (
        <p className="text-sm leading-relaxed text-primary-text/60">{set.blockedNote ?? 'Nobody in the pool clears every check.'}</p>
      )}

      <ul className="mt-3 flex flex-col gap-3">
        {set.candidates.map((candidate) => (
          <li key={candidate.member.id}>
            <CandidateCard
              groupName={`candidate-${item.id}-${compact ? 'm' : 'd'}`}
              candidate={candidate}
              selected={candidate.member.id === chosenId}
              isBest={candidate.member.id === bestId}
              compact={compact}
              subtitle={subtitleOf(candidate, item, base, leg, compact)}
              onSelect={() => onChoose(candidate.member.id)}
            />
          </li>
        ))}
      </ul>
    </section>
  )
}

/** `Cabin crew · base BKK · Korean`, or on a phone `Cabin crew · speaks Korean · base BKK`. */
function subtitleOf(candidate: ReplacementCandidate, item: FixBreak, base: string, leg: RosterLeg | undefined, compact: boolean): string {
  const role = ROLE_LABELS[candidate.member.role]
  const spoken =
    item.code === 'NO_LOCAL_CREW' && leg
      ? candidate.member.languages
          .filter((code) => leg.localLanguages.includes(code))
          .map(languageName)
          .join(', ')
      : ''
  if (compact) return [role, spoken ? `speaks ${spoken}` : '', `base ${base}`].filter(Boolean).join(' · ')
  return [role, `base ${base}`, spoken].filter(Boolean).join(' · ')
}

function CandidateCard({
  groupName,
  candidate,
  selected,
  isBest,
  compact,
  subtitle,
  onSelect,
}: {
  groupName: string
  candidate: ReplacementCandidate
  selected: boolean
  isBest: boolean
  compact: boolean
  subtitle: string
  onSelect: () => void
}) {
  const { member, checks, allowed } = candidate
  const failures = checks.filter((check) => !check.ok)
  const active = selected && allowed

  return (
    <label
      className={`group relative block rounded-xl border bg-white px-4 py-3.5 transition-colors ${
        allowed ? 'cursor-pointer' : 'cursor-not-allowed'
      } ${
        active
          ? 'border-2 border-btn-yellow px-[15px] py-[13px]'
          : allowed
            ? 'border-border-desc/60 hover:border-btn-yellow/60'
            : `border-border-desc/50 ${compact ? 'bg-page-bg/60 opacity-75' : ''}`
      }`}
    >
      <input
        type="radio"
        name={groupName}
        checked={active}
        disabled={!allowed}
        onChange={onSelect}
        aria-label={`Select ${member.name}`}
        className="peer sr-only"
      />

      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary ${
            active ? 'border-btn-yellow' : 'border-border-desc'
          }`}
        >
          {active && <span className="h-2.5 w-2.5 rounded-full bg-btn-navy" />}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className={`text-sm font-extrabold ${allowed || !compact ? 'text-primary-text' : 'text-primary-text/50'}`}>
                {member.name}
              </p>
              <p className="mt-0.5 text-xs text-primary-text/55">{subtitle}</p>
            </div>
            <StatePill allowed={allowed} selected={active} best={compact && isBest} compact={compact} />
          </div>

          {/* On a phone a blocked card spends one red line on why, instead of a row of chips and a second line. */}
          {compact && !allowed ? (
            <p className="mt-2 text-xs font-medium text-invalid">Not allowed · {failures[0]?.reason ?? failures[0]?.label}</p>
          ) : (
            <>
              <ul className="mt-2.5 flex flex-wrap gap-1.5">
                {checks.map((check) => (
                  <li
                    key={check.label}
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold ${
                      check.ok ? 'border-valid/20 bg-valid/10 text-valid' : 'border-invalid/25 bg-invalid/10 text-invalid'
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
                    <li key={check.label} className="text-xs text-invalid">
                      {check.reason ?? check.label}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </label>
  )
}

/** `Selected` on the candidate about to go on, `Can take it` on the other legal ones, `Not allowed` on the blocked. */
function StatePill({ allowed, selected, best, compact }: { allowed: boolean; selected: boolean; best: boolean; compact: boolean }) {
  if (!allowed) {
    return compact ? null : (
      <span className="shrink-0 rounded-full bg-invalid/10 px-2.5 py-0.5 text-[11px] font-bold text-invalid">Not allowed</span>
    )
  }
  if (compact) {
    return best ? (
      <span className="shrink-0 rounded-full bg-secondary/30 px-2.5 py-0.5 text-[11px] font-bold text-amber-ink">Best match</span>
    ) : null
  }
  return selected ? (
    <span className="shrink-0 rounded-full bg-btn-navy px-2.5 py-0.5 text-[11px] font-bold text-white">Selected</span>
  ) : (
    <span className="shrink-0 rounded-full bg-valid/10 px-2.5 py-0.5 text-[11px] font-bold text-valid">Can take it</span>
  )
}

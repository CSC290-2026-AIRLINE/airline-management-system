/**
 * The crewed legs, after auto-assign has run.
 *
 * Every cell is read straight off a `LegCrew`, and the status column is read
 * off the same derived break list the rule-break card renders, so a leg can never
 * show `OK` while a card below says it is broken.
 */
import { formatTime, pluralise, ROSTER_TIME_ZONE } from '../../build-pairings/types/format'
import { RouteText } from '../../build-pairings/components/route-text'
import type { LegCrew, RosterCrewMember, RosterRuleBreak } from '../types/types'

const shortDateFormatter = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', timeZone: ROSTER_TIME_ZONE })

/** `15 Sep`, the date under the flight number. */
function formatShortDate(instant: string): string {
  return shortDateFormatter.format(new Date(instant))
}

export interface AssignmentsProps {
  assignments: readonly LegCrew[]
  breaksByLeg: Map<string, RosterRuleBreak[]>
}

/** `4 of 4` for a full complement, `2 of 4` when the leg is short. */
function complement(have: number, need: number): string {
  return `${have} of ${need}`
}

/** The tag beside a local-crew name is the country, which reads faster than the language code. */
const COUNTRY_BY_LANGUAGE: Record<string, string> = { ja: 'JP', ko: 'KR', th: 'TH', zh: 'CN', en: 'GB', ms: 'MY', id: 'ID', vi: 'VN' }

function Names({
  members,
  missingLabel,
  notRequired = false,
}: {
  members: readonly { name: string }[]
  missingLabel?: string
  /** The leg needs nobody in this seat (police on a domestic flight), so an empty list is not a gap. */
  notRequired?: boolean
}) {
  if (members.length === 0 && notRequired) return <span>—</span>
  if (members.length === 0) {
    return <span className="rounded-full bg-invalid-bg px-2.5 py-0.5 text-[11px] font-bold text-invalid">None</span>
  }
  return (
    <span className="flex flex-col">
      {/* Short names ("S. Boonmee") are not unique, so the position is part of the key. */}
      {members.map((member, index) => (
        <span key={`${index}:${member.name}`}>{member.name}</span>
      ))}
      {missingLabel && <span className="font-bold text-invalid">{missingLabel}</span>}
    </span>
  )
}

/** Country tag beside a local-crew name: the destination language they speak, e.g. `JP`. */
function LanguageBadge({ member, assignment }: { member: RosterCrewMember; assignment: LegCrew }) {
  const code = member.languages.find((language) => assignment.leg.localLanguages.includes(language))
  if (!code) return null
  return (
    <span className="ml-1.5 rounded-full bg-info-bg px-1.5 py-0.5 text-[10px] font-bold text-primary uppercase">
      {COUNTRY_BY_LANGUAGE[code] ?? code}
    </span>
  )
}

/** `Missing` beside the police names when an international leg is short. */
function policeMissing(assignment: LegCrew): string | undefined {
  return assignment.police.length < assignment.policeRequired ? 'Missing' : undefined
}

function StatusCell({ breaks }: { breaks: readonly RosterRuleBreak[] }) {
  if (breaks.length === 0) {
    return <span className="rounded-full bg-valid-bg px-2.5 py-0.5 text-[11px] font-bold text-valid">OK</span>
  }
  return (
    <span className="flex flex-col items-start gap-1">
      {breaks.map((ruleBreak) => (
        <span key={ruleBreak.id} className="rounded-full bg-invalid-bg px-2.5 py-0.5 text-[11px] font-bold text-invalid">
          {ruleBreak.code}
        </span>
      ))}
    </span>
  )
}

const HEAD = 'px-3 py-3 text-[11px] font-semibold tracking-wider text-primary-text/50 uppercase'

/** Desktop table. One row per leg, tinted when that leg is breaking a rule. */
export function AssignmentsTable({ assignments, breaksByLeg }: AssignmentsProps) {
  if (assignments.length === 0) return null
  return (
    <section className="hidden rounded-2xl border border-border-desc/40 bg-card-bg p-7 lg:block">
      <h2 className="text-xl font-bold text-primary-text">Crew per leg ({assignments.length})</h2>
      <div className="mt-4 max-h-[560px] overflow-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead className="sticky top-0 z-10 bg-card-bg">
            <tr className="text-left">
              <th className={`${HEAD} pl-0`}>Flight</th>
              <th className={HEAD}>Route</th>
              <th className={HEAD}>Time</th>
              <th className={HEAD}>Captain</th>
              <th className={HEAD}>First officer</th>
              <th className={HEAD}>Cabin crew</th>
              <th className={HEAD}>Local crew</th>
              <th className={HEAD}>Police</th>
              <th className={HEAD}>Status</th>
            </tr>
          </thead>
          <tbody>
            {assignments.map((assignment) => {
              const breaks = breaksByLeg.get(assignment.leg.legId) ?? []
              return (
                <tr key={assignment.leg.legId} className={breaks.length > 0 ? 'bg-invalid/5' : ''}>
                  <td className="py-3.5 pr-3 pl-3">
                    <span className="block font-bold text-primary-text">{assignment.leg.flightNumber}</span>
                    <span className="block text-[11px] text-primary-text/45">
                      {assignment.pairingCode} · {formatShortDate(assignment.leg.departureAt)}
                    </span>
                  </td>
                  <td className="px-3 py-3.5 whitespace-nowrap text-primary-text">
                    <RouteText
                      route={[assignment.leg.origin, assignment.leg.destination]}
                      arrowSize="h-3 w-3"
                      arrowClassName="text-primary-text"
                    />
                  </td>
                  <td className="px-3 py-3.5 whitespace-nowrap text-primary-text">
                    {formatTime(assignment.leg.departureAt)}–{formatTime(assignment.leg.arrivalAt)}
                  </td>
                  <td className="px-3 py-3.5 text-primary-text">{assignment.captain?.name ?? '—'}</td>
                  <td className="px-3 py-3.5 text-primary-text">{assignment.firstOfficer?.name ?? '—'}</td>
                  <td className="px-3 py-3.5 text-primary-text">{complement(assignment.cabinCrew.length, assignment.cabinRequired)}</td>
                  <td className="px-3 py-3.5 text-primary-text">
                    {assignment.leg.international ? (
                      <>
                        <Names members={assignment.localCrew} />
                        {assignment.localCrew[0] && <LanguageBadge member={assignment.localCrew[0]} assignment={assignment} />}
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-3 py-3.5 text-primary-text">
                    <Names
                      members={assignment.police}
                      missingLabel={policeMissing(assignment)}
                      notRequired={assignment.policeRequired === 0}
                    />
                  </td>
                  <td className="px-3 py-3.5">
                    <StatusCell breaks={breaks} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

/** Mobile: the same legs as cards, because the table has nine columns. */
export function AssignmentCards({ assignments, breaksByLeg }: AssignmentsProps) {
  if (assignments.length === 0) return null
  return (
    <section className="rounded-2xl border border-border-desc/40 bg-card-bg p-5 lg:hidden">
      <h2 className="text-lg font-bold text-primary-text">Crew per leg ({assignments.length})</h2>
      <ul className="mt-3 flex flex-col gap-3">
        {assignments.map((assignment) => {
          const breaks = breaksByLeg.get(assignment.leg.legId) ?? []
          const local = assignment.localCrew[0]
          const policeShort = assignment.police.length < assignment.policeRequired
          return (
            <li
              key={assignment.leg.legId}
              className={`rounded-xl border px-4 py-3.5 ${breaks.length > 0 ? 'border-invalid/30 bg-invalid/5' : 'border-border-desc/50 bg-card-bg'}`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-bold text-primary-text">
                  {assignment.leg.flightNumber} ·{' '}
                  <RouteText
                    route={[assignment.leg.origin, assignment.leg.destination]}
                    arrowSize="h-3.5 w-3.5"
                    arrowClassName="text-primary-text"
                  />
                </p>
                <div className="shrink-0">
                  <StatusCell breaks={breaks} />
                </div>
              </div>
              <div className="mt-1.5 flex flex-col gap-0.5 text-[13px] text-primary-text/70">
                <p>
                  {assignment.pairingCode} · {formatShortDate(assignment.leg.departureAt)} · {formatTime(assignment.leg.departureAt)}–
                  {formatTime(assignment.leg.arrivalAt)}
                </p>
                <p>
                  Capt {assignment.captain?.name ?? '—'} · FO {assignment.firstOfficer?.name ?? '—'}
                </p>
                <p>
                  Cabin {complement(assignment.cabinCrew.length, assignment.cabinRequired)} ·{' '}
                  {!assignment.leg.international ? (
                    'Local —'
                  ) : local ? (
                    <>
                      Local {local.name}
                      {(() => {
                        const code = local.languages.find((language) => assignment.leg.localLanguages.includes(language))
                        return code ? ` (${COUNTRY_BY_LANGUAGE[code] ?? code})` : ''
                      })()}
                    </>
                  ) : (
                    <>
                      Local <span className="font-semibold text-invalid">none</span>
                    </>
                  )}
                  {assignment.policeRequired > 0 && (
                    <>
                      {' '}
                      ·{' '}
                      <span className={policeShort ? 'font-semibold text-invalid' : undefined}>
                        Police {assignment.police.length} of {assignment.policeRequired}
                      </span>
                    </>
                  )}
                </p>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** `3 rule breaks on 2 legs`, or nothing when auto-assign has not run yet. */
export function BreakCountLabel({ assignments, breaks }: { assignments: readonly LegCrew[]; breaks: readonly RosterRuleBreak[] }) {
  if (assignments.length === 0 || breaks.length === 0) return null
  const legCount = new Set(breaks.map((ruleBreak) => ruleBreak.legId)).size
  return (
    <p className="text-sm text-primary-text/70">
      {pluralise(breaks.length, 'rule break')} on {pluralise(legCount, 'leg')}
    </p>
  )
}

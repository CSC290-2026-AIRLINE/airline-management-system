/**
 * The crewed legs, after auto-assign has run.
 *
 * Every cell is read straight off a `LegCrew`, and the status column is read
 * off the same derived break list the rule-break card renders, so a leg can never
 * show `OK` while a card below says it is broken.
 */
import type { ReactNode } from 'react'
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

function Names({ members, missingLabel }: { members: readonly { name: string }[]; missingLabel?: string }) {
  if (members.length === 0) {
    return <span className="rounded-full bg-invalid-bg px-2.5 py-0.5 text-[11px] font-bold text-invalid">None</span>
  }
  return (
    <span className="flex flex-col">
      {members.map((member) => (
        <span key={member.name}>{member.name}</span>
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
                    <Names members={assignment.police} missingLabel={policeMissing(assignment)} />
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
          return (
            <li
              key={assignment.leg.legId}
              className={`rounded-xl border p-4 ${breaks.length > 0 ? 'border-invalid/30 bg-invalid/5' : 'border-border-desc/40 bg-card-bg'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-primary-text">
                    {assignment.leg.flightNumber} ·{' '}
                    <RouteText
                      route={[assignment.leg.origin, assignment.leg.destination]}
                      arrowSize="h-3.5 w-3.5"
                      arrowClassName="text-primary-text"
                    />
                  </p>
                  <p className="mt-0.5 text-[13px] text-primary-text/60">
                    {assignment.pairingCode} · {formatShortDate(assignment.leg.departureAt)} · {formatTime(assignment.leg.departureAt)}–
                    {formatTime(assignment.leg.arrivalAt)}
                  </p>
                </div>
                <StatusCell breaks={breaks} />
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-[13px]">
                <Row label="Captain" value={assignment.captain?.name ?? '—'} />
                <Row label="First officer" value={assignment.firstOfficer?.name ?? '—'} />
                <Row label="Cabin crew" value={complement(assignment.cabinCrew.length, assignment.cabinRequired)} />
                <Row
                  label="Local crew"
                  value={
                    !assignment.leg.international ? (
                      '—'
                    ) : assignment.localCrew.length === 0 ? (
                      <Names members={[]} />
                    ) : (
                      <>
                        {assignment.localCrew[0].name}
                        <LanguageBadge member={assignment.localCrew[0]} assignment={assignment} />
                      </>
                    )
                  }
                />
                <Row label="Police" value={<Names members={assignment.police} missingLabel={policeMissing(assignment)} />} />
              </dl>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold tracking-wide text-primary-text/50 uppercase">{label}</dt>
      <dd className="text-primary-text/85">{value}</dd>
    </div>
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

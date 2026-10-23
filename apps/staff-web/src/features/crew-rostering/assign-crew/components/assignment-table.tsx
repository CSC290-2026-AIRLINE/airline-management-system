/**
 * The crewed legs, after auto-assign has run.
 *
 * Every cell is read straight off a `LegAssignment`, and the status column is read
 * off the same derived break list the rule-break card renders, so a leg can never
 * show `OK` while a card below says it is broken.
 */
import type { ReactNode } from 'react'
import { formatRoute, formatTime, pluralise, ROSTER_TIME_ZONE } from '../../build-pairings/types/format'
import { CABIN_CREW_PER_LEG, POLICE_PER_INTERNATIONAL_LEG } from '../types/mock-data'
import { isInternational } from '../types/crew-engine'
import type { LegAssignment, RuleBreak } from '../types/types'

const shortDateFormatter = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', timeZone: ROSTER_TIME_ZONE })

/** `15 Sep`, the date under the flight number. */
function formatShortDate(instant: string): string {
  return shortDateFormatter.format(new Date(instant))
}

export interface AssignmentsProps {
  assignments: readonly LegAssignment[]
  breaksByLeg: Map<string, RuleBreak[]>
}

/** `4 of 4` for a full complement, `2 of 4` when the leg is short. */
function complement(have: number, need: number): string {
  return `${have} of ${need}`
}

function Names({ members, missingLabel }: { members: readonly { name: string; nationality: string }[]; missingLabel?: string }) {
  if (members.length === 0) return <span className="font-semibold text-invalid">None</span>
  return (
    <span>
      {members.map((member) => member.name).join(', ')}
      {missingLabel && <span className="ml-1 font-semibold text-invalid">{missingLabel}</span>}
    </span>
  )
}

/** Nationality pill that sits beside a local-crew name. */
function NationalityBadge({ code }: { code: string }) {
  return <span className="ml-1.5 rounded bg-info-bg px-1.5 py-0.5 text-[10px] font-bold text-primary">{code}</span>
}

function StatusCell({ breaks }: { breaks: readonly RuleBreak[] }) {
  if (breaks.length === 0) {
    return <span className="rounded-full bg-valid-bg px-2.5 py-1 text-[11px] font-bold text-valid">OK</span>
  }
  return (
    <span className="flex flex-wrap justify-end gap-1.5">
      {breaks.map((ruleBreak) => (
        <span key={ruleBreak.id} className="rounded-full bg-invalid-bg px-2.5 py-1 text-[11px] font-bold text-invalid">
          {ruleBreak.code}
        </span>
      ))}
    </span>
  )
}

/** Desktop table. One row per leg, tinted when that leg is breaking a rule. */
export function AssignmentsTable({ assignments, breaksByLeg }: AssignmentsProps) {
  if (assignments.length === 0) return null
  return (
    <section className="hidden overflow-hidden rounded-2xl border border-border-desc/40 bg-card-bg lg:block">
      <div className="max-h-[430px] overflow-y-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-page-bg">
            <tr className="text-left text-[13px] font-semibold text-primary-text/70">
              <th className="px-5 py-3">Flight</th>
              <th className="px-3 py-3">Route</th>
              <th className="px-3 py-3">Local time</th>
              <th className="px-3 py-3">Captain</th>
              <th className="px-3 py-3">First officer</th>
              <th className="px-3 py-3">Cabin crew</th>
              <th className="px-3 py-3">Local crew</th>
              <th className="px-3 py-3">Police</th>
              <th className="px-5 py-3 text-right">Status</th>
            </tr>
          </thead>
          <tbody>
            {assignments.map((assignment) => {
              const breaks = breaksByLeg.get(assignment.leg.flightId) ?? []
              return (
                <tr key={assignment.leg.flightId} className={`border-t border-border-desc/30 ${breaks.length > 0 ? 'bg-invalid/5' : ''}`}>
                  <td className="px-5 py-4">
                    <span className="block font-bold text-primary-text">{assignment.leg.flightNumber}</span>
                    <span className="block text-[12px] text-primary-text/55">
                      {assignment.pairingId} · {formatShortDate(assignment.leg.departureAt)}
                    </span>
                  </td>
                  <td className="px-3 py-4 text-primary-text/85">{formatRoute([assignment.leg.origin, assignment.leg.destination])}</td>
                  <td className="px-3 py-4 whitespace-nowrap text-primary-text/85">
                    {formatTime(assignment.leg.departureAt)}–{formatTime(assignment.leg.arrivalAt)}
                  </td>
                  <td className="px-3 py-4 text-primary-text/85">{assignment.captain?.name ?? '—'}</td>
                  <td className="px-3 py-4 text-primary-text/85">{assignment.firstOfficer?.name ?? '—'}</td>
                  <td className="px-3 py-4 text-primary-text/85">{complement(assignment.cabinCrew.length, CABIN_CREW_PER_LEG)}</td>
                  <td className="px-3 py-4 text-primary-text/85">
                    <Names members={assignment.localCrew} />
                    {assignment.localCrew[0] && <NationalityBadge code={assignment.localCrew[0].nationality} />}
                  </td>
                  <td className="px-3 py-4 text-primary-text/85">
                    <Names
                      members={assignment.police}
                      missingLabel={
                        isInternational(assignment.leg) && assignment.police.length < POLICE_PER_INTERNATIONAL_LEG ? 'Missing' : undefined
                      }
                    />
                  </td>
                  <td className="px-5 py-4 text-right">
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
    <ul className="flex flex-col gap-3 lg:hidden">
      {assignments.map((assignment) => {
        const breaks = breaksByLeg.get(assignment.leg.flightId) ?? []
        return (
          <li
            key={assignment.leg.flightId}
            className={`rounded-xl border p-4 ${breaks.length > 0 ? 'border-invalid/30 bg-invalid/5' : 'border-border-desc/40 bg-card-bg'}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-bold text-primary-text">
                  {assignment.leg.flightNumber} · {formatRoute([assignment.leg.origin, assignment.leg.destination])}
                </p>
                <p className="mt-0.5 text-[13px] text-primary-text/60">
                  {assignment.pairingId} · {formatTime(assignment.leg.departureAt)}–{formatTime(assignment.leg.arrivalAt)}
                </p>
              </div>
              <StatusCell breaks={breaks} />
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[13px]">
              <Row label="Captain" value={assignment.captain?.name ?? '—'} />
              <Row label="First officer" value={assignment.firstOfficer?.name ?? '—'} />
              <Row label="Cabin crew" value={complement(assignment.cabinCrew.length, CABIN_CREW_PER_LEG)} />
              <Row
                label="Local crew"
                value={
                  assignment.localCrew.length === 0 ? (
                    <span className="font-semibold text-invalid">None</span>
                  ) : (
                    <>
                      {assignment.localCrew[0].name}
                      <NationalityBadge code={assignment.localCrew[0].nationality} />
                    </>
                  )
                }
              />
              <Row
                label="Police"
                value={
                  <Names
                    members={assignment.police}
                    missingLabel={
                      isInternational(assignment.leg) && assignment.police.length < POLICE_PER_INTERNATIONAL_LEG ? 'Missing' : undefined
                    }
                  />
                }
              />
            </dl>
          </li>
        )
      })}
    </ul>
  )
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold tracking-wide text-primary-text/50 uppercase">{label}</dt>
      <dd className="truncate text-primary-text/85">{value}</dd>
    </div>
  )
}

/** `3 rule breaks on 2 legs`, or nothing when auto-assign has not run yet. */
export function BreakCountLabel({ assignments, breaks }: { assignments: readonly LegAssignment[]; breaks: readonly RuleBreak[] }) {
  if (assignments.length === 0 || breaks.length === 0) return null
  const legCount = new Set(breaks.flatMap((ruleBreak) => ruleBreak.legIds)).size
  return (
    <p className="text-sm text-primary-text/70">
      {pluralise(breaks.length, 'rule break')} on {pluralise(legCount, 'leg')}
    </p>
  )
}

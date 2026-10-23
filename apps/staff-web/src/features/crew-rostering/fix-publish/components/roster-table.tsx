/**
 * The published roster: one row per leg, with every seat spelled out.
 *
 * This is the view an operator checks their own work against, so the cabin column
 * prints `4 of 4` rather than four names — a count reads at a glance where a stack of
 * names does not — while the columns an operator has to contact someone about print
 * names. A gap is written as the gap it is (`Missing`, `Not covered`) rather than left
 * blank, because a blank cell in a roster table reads as "nobody looked".
 */
import type { ReactNode } from 'react'
import { Button } from '../../shared/ui'
import { formatTime } from '../../build-pairings/types/format'
import { dayMonth } from '../types/break-descriptions'
import { CABIN_CREW_PER_LEG } from '../../assign-crew/types/mock-data'
import type { CrewMember, LegAssignment } from '../types/types'

interface RosterTableProps {
  assignments: readonly LegAssignment[]
  /** Legs with a seat a sick call left open, which need `Find cover` rather than `Sick call`. */
  uncoveredLegIds: readonly string[]
  /** True once every open seat has been refilled — the roster no longer needs chasing. */
  updated: boolean
  onSickCall: (legId: string) => void
  onFindCover: (legId: string) => void
}

export function RosterTable({ assignments, uncoveredLegIds, updated, onSickCall, onFindCover }: RosterTableProps) {
  const ordered = [...assignments].sort((a, b) => a.leg.departureAt.localeCompare(b.leg.departureAt))

  return (
    <section className="overflow-hidden rounded-2xl border border-border-desc/40 bg-card-bg">
      <header className="border-b border-border-desc/30 px-5 py-4 sm:px-6 sm:py-5">
        <h2 className="text-lg font-extrabold tracking-tight text-primary-text">Published roster</h2>
        <p className="mt-1 text-sm leading-relaxed text-primary-text/60">
          This roster is live. Later changes (sick calls, flight delays or cancellations) are re-checked and re-sent to the crew affected.
        </p>
      </header>

      <div className="overflow-x-auto">
        <table className="hidden w-full border-collapse text-left xl:table">
          <thead>
            <tr className="border-b border-border-desc/30">
              {['Flight', 'Route', 'Time', 'Captain', 'First officer', 'Cabin crew', 'Local crew', 'Police', 'Status', 'Action'].map(
                (heading) => (
                  <th
                    key={heading}
                    scope="col"
                    className="px-4 py-3 text-[11px] font-semibold tracking-widest text-primary-text/60 uppercase"
                  >
                    {heading}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {ordered.map((assignment) => (
              <RosterRow
                key={assignment.leg.flightId}
                assignment={assignment}
                uncovered={uncoveredLegIds.includes(assignment.leg.flightId)}
                onSickCall={onSickCall}
                onFindCover={onFindCover}
              />
            ))}
          </tbody>
        </table>
      </div>

      <ul className="flex flex-col xl:hidden">
        {ordered.map((assignment) => {
          const uncovered = uncoveredLegIds.includes(assignment.leg.flightId)
          return (
            <li key={assignment.leg.flightId} className="border-b border-border-desc/25 px-5 py-4 last:border-b-0">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm font-bold text-primary-text">
                  {assignment.leg.flightNumber}{' '}
                  <span className="font-normal text-primary-text/60">
                    {assignment.pairingId} · {dayMonth(assignment.leg.departureAt)}
                  </span>
                </p>
                <StatusPill uncovered={uncovered} />
              </div>
              <p className="mt-1 text-xs text-primary-text/60">
                {assignment.leg.origin} → {assignment.leg.destination} · {formatTime(assignment.leg.departureAt)}
              </p>
              <dl className="mt-2.5 flex flex-col gap-1.5">
                <CrewLine label="Captain" value={assignment.captain ? assignment.captain.name : <Gap>Missing</Gap>} />
                <CrewLine label="First officer" value={assignment.firstOfficer?.name ?? '—'} />
                <CrewLine label="Cabin crew" value={cabinText(assignment.cabinCrew.length)} />
                <CrewLine label="Local crew" value={localText(assignment.localCrew)} />
                <CrewLine label="Police" value={assignment.police.map((member) => member.name).join(', ') || '—'} />
              </dl>
              <div className="mt-3">
                {uncovered ? (
                  <Button className="!px-3 !py-1.5 text-xs" onClick={() => onFindCover(assignment.leg.flightId)}>
                    Find cover →
                  </Button>
                ) : (
                  <Button variant="outline" className="!px-3 !py-1.5 text-xs" onClick={() => onSickCall(assignment.leg.flightId)}>
                    Sick call
                  </Button>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      {updated && (
        <p className="border-t border-border-desc/30 bg-primary/3 px-5 py-3 text-xs font-medium text-primary/80 sm:px-6">
          A leg has been re-crewed since publishing. Both names were notified (Feature 13) and the audit log (Feature 15) has the change.
        </p>
      )}
    </section>
  )
}

function RosterRow({
  assignment,
  uncovered,
  onSickCall,
  onFindCover,
}: {
  assignment: LegAssignment
  uncovered: boolean
  onSickCall: (legId: string) => void
  onFindCover: (legId: string) => void
}) {
  return (
    <tr className="border-b border-border-desc/20 last:border-b-0">
      <td className="px-4 py-3.5 whitespace-nowrap">
        <p className="text-sm font-bold text-primary-text">{assignment.leg.flightNumber}</p>
        <p className="text-[11px] text-primary-text/60">
          {assignment.pairingId} · {dayMonth(assignment.leg.departureAt)}
        </p>
      </td>
      <td className="px-4 py-3.5 text-sm whitespace-nowrap text-primary-text/70">
        {assignment.leg.origin} → {assignment.leg.destination}
      </td>
      <td className="px-4 py-3.5 text-sm whitespace-nowrap text-primary-text/70">
        {formatTime(assignment.leg.departureAt)}–{formatTime(assignment.leg.arrivalAt)}
      </td>
      <td className="px-4 py-3.5 text-sm whitespace-nowrap text-primary-text">{assignment.captain?.name ?? <Gap>Missing</Gap>}</td>
      <td className="px-4 py-3.5 text-sm whitespace-nowrap text-primary-text/70">{assignment.firstOfficer?.name ?? '—'}</td>
      <td className="px-4 py-3.5 text-sm whitespace-nowrap text-primary-text/70">{cabinText(assignment.cabinCrew.length)}</td>
      <td className="px-4 py-3.5 text-sm whitespace-nowrap text-primary-text/70">{localText(assignment.localCrew)}</td>
      <td className="px-4 py-3.5 text-sm whitespace-nowrap text-primary-text/70">
        {assignment.police.map((member) => member.name).join(', ') || '—'}
      </td>
      <td className="px-4 py-3.5">
        <StatusPill uncovered={uncovered} />
      </td>
      <td className="px-4 py-3.5 text-right whitespace-nowrap">
        {uncovered ? (
          <Button className="!px-3 !py-1.5 text-xs" onClick={() => onFindCover(assignment.leg.flightId)}>
            Find cover →
          </Button>
        ) : (
          <Button variant="outline" className="!px-3 !py-1.5 text-xs" onClick={() => onSickCall(assignment.leg.flightId)}>
            Sick call
          </Button>
        )}
      </td>
    </tr>
  )
}

function CrewLine({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[11px] font-semibold tracking-widest text-primary-text/50 uppercase">{label}</dt>
      <dd className="text-right text-sm text-primary-text/70">{value}</dd>
    </div>
  )
}

function cabinText(count: number): ReactNode {
  const ok = count >= CABIN_CREW_PER_LEG
  return <span className={ok ? 'text-primary-text/70' : 'text-invalid'}>{`${count} of ${CABIN_CREW_PER_LEG}`}</span>
}

/** `Y. Sato (JP)` — the nationality is what tells an operator they can actually brief them. */
function localText(members: readonly CrewMember[]): string {
  return members.map((member) => `${member.name} (${member.nationality})`).join(', ') || '—'
}

function StatusPill({ uncovered }: { uncovered: boolean }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${uncovered ? 'bg-invalid-bg text-invalid' : 'bg-valid-bg text-valid'}`}>
      {uncovered ? 'Not covered' : 'OK'}
    </span>
  )
}

function Gap({ children }: { children: ReactNode }) {
  return <span className="font-semibold text-invalid">{children}</span>
}

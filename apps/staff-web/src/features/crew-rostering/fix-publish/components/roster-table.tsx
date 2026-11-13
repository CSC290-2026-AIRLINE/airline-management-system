/**
 * The published roster: one row per leg, with every seat spelled out.
 *
 * This is the view an operator checks their own work against, so the cabin column
 * prints `4 of 4` rather than four names — a count reads at a glance where a stack of
 * names does not — while the columns an operator has to contact someone about print
 * names. A gap is written as the gap it is (`Missing`, `Not covered`) rather than left
 * blank, because a blank cell in a roster table reads as "nobody looked".
 *
 * A leg with something open on it is tinted and its action becomes the way to that item:
 * `Find cover →` for an empty seat, `Review →` for any other open break.
 */
import type { ReactNode } from 'react'
import { Button } from '../../shared/ui'
import { formatTime } from '../../build-pairings/types/format'
import { countryTag, dayMonth } from '../types/labels'
import type { CrewMember, FixBreak, LegAssignment } from '../types/types'

interface RosterTableProps {
  assignments: readonly LegAssignment[]
  /** Every open item, so a leg can say what is wrong with it. */
  openBreaks: readonly FixBreak[]
  /** True once every open seat has been refilled — the roster no longer needs chasing. */
  updated: boolean
  onSickCall: (legId: string) => void
  onFindCover: (legId: string) => void
}

/** What is open on a leg: nothing, an empty seat, or some other break. */
type LegState = { kind: 'ok' } | { kind: 'uncovered' } | { kind: 'break'; label: string; subjectId?: string }

function legState(legId: string, openBreaks: readonly FixBreak[]): LegState {
  const open = openBreaks.filter((item) => item.legId === legId)
  if (open.length === 0) return { kind: 'ok' }
  if (open.some((item) => item.code === 'NO_LEGAL_CREW' || item.removed)) return { kind: 'uncovered' }
  const first = open[0]
  return { kind: 'break', label: first.code === 'POLICE_NO_SEAT' ? 'No seat' : first.code, subjectId: first.subjectId }
}

const HEADINGS = ['Flight', 'Route', 'Time', 'Captain', 'First officer', 'Cabin crew', 'Local crew', 'Police', 'Status', 'Action']

export function RosterTable({ assignments, openBreaks, updated, onSickCall, onFindCover }: RosterTableProps) {
  const ordered = [...assignments].sort((a, b) => a.leg.departureAt.localeCompare(b.leg.departureAt))

  return (
    <section id="published-roster" className="rounded-2xl border border-border-desc/40 bg-card-bg p-5 lg:p-7">
      <h2 className="text-xl font-extrabold tracking-tight text-primary-text lg:text-2xl">
        Published roster
        <span className="lg:hidden"> ({ordered.length} legs)</span>
        {updated ? ' · updated' : ''}
      </h2>
      <p className="mt-1.5 hidden text-sm leading-relaxed text-primary-text/60 lg:block">
        This roster is live. Later changes (sick calls, flight delays or cancellations) are re-checked against every rule.
      </p>
      <p className="mt-1 text-xs text-primary-text/55 lg:hidden">Use Sick call on a leg to remove someone from it.</p>

      <div className="mt-5 hidden overflow-x-auto xl:block">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-border-desc/40">
              {HEADINGS.map((heading) => (
                <th
                  key={heading}
                  scope="col"
                  className={`px-3 py-3 text-[11px] font-semibold tracking-widest text-primary-text/55 uppercase ${heading === 'Action' ? 'text-center' : ''}`}
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ordered.map((assignment) => (
              <RosterRow
                key={assignment.leg.legId}
                assignment={assignment}
                state={legState(assignment.leg.legId, openBreaks)}
                onSickCall={onSickCall}
                onFindCover={onFindCover}
              />
            ))}
          </tbody>
        </table>
      </div>

      <ul className="mt-4 flex flex-col gap-3 xl:hidden">
        {ordered.map((assignment) => {
          const state = legState(assignment.leg.legId, openBreaks)
          return (
            <li
              key={assignment.leg.legId}
              className={`rounded-xl border px-4 py-3.5 ${state.kind === 'ok' ? 'border-border-desc/50' : 'border-invalid/30 bg-invalid/5'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-extrabold text-primary-text">
                  {assignment.leg.flightNumber} · {assignment.leg.origin} → {assignment.leg.destination}
                </p>
                <StatusPill state={state} />
              </div>
              <p className="mt-1 text-xs text-primary-text/55">
                {assignment.pairingCode} · {dayMonth(assignment.leg.departureAt)} · {formatTime(assignment.leg.departureAt)}–
                {formatTime(assignment.leg.arrivalAt)}
              </p>
              <p className="mt-2 text-xs text-primary-text/80">
                Capt {assignment.captain ? assignment.captain.name : <Gap>Missing</Gap>} · FO {assignment.firstOfficer?.name ?? '—'}
              </p>
              <p className="mt-0.5 text-xs text-primary-text/80">
                Cabin {assignment.cabinCrew.length}/{assignment.cabinRequired} · Local {localText(assignment)} · Police{' '}
                {assignment.police.length} of {assignment.policeRequired}
              </p>
              <div className="mt-3">
                <ActionButton state={state} legId={assignment.leg.legId} onSickCall={onSickCall} onFindCover={onFindCover} />
              </div>
            </li>
          )
        })}
      </ul>

      {updated && (
        <p className="mt-5 rounded-lg bg-info-bg px-4 py-3 text-xs font-medium text-primary/80">
          A leg has been re-crewed since publishing. The audit log (Feature 15) has the change; crew notification (Feature 13) is not
          connected yet.
        </p>
      )}
    </section>
  )
}

function RosterRow({
  assignment,
  state,
  onSickCall,
  onFindCover,
}: {
  assignment: LegAssignment
  state: LegState
  onSickCall: (legId: string) => void
  onFindCover: (legId: string) => void
}) {
  const local = assignment.leg.international ? assignment.localCrew[0] : undefined
  const language = local?.languages.find((code) => assignment.leg.localLanguages.includes(code))

  return (
    <tr className={`border-b border-border-desc/30 last:border-b-0 ${state.kind === 'ok' ? '' : 'bg-invalid/5'}`}>
      <td className="px-3 py-3.5 whitespace-nowrap">
        <p className="text-sm font-extrabold text-primary-text">{assignment.leg.flightNumber}</p>
        <p className="text-[11px] text-primary-text/45">
          {assignment.pairingCode} · {dayMonth(assignment.leg.departureAt)}
        </p>
      </td>
      <td className="px-3 py-3.5 text-sm whitespace-nowrap text-primary-text">
        {assignment.leg.origin} → {assignment.leg.destination}
      </td>
      <td className="px-3 py-3.5 text-sm whitespace-nowrap text-primary-text">
        {formatTime(assignment.leg.departureAt)}–{formatTime(assignment.leg.arrivalAt)}
      </td>
      <td className="px-3 py-3.5 text-sm whitespace-nowrap text-primary-text">{assignment.captain?.name ?? <Gap>Missing</Gap>}</td>
      <td className="px-3 py-3.5 text-sm whitespace-nowrap text-primary-text">{assignment.firstOfficer?.name ?? '—'}</td>
      <td className="px-3 py-3.5 text-sm whitespace-nowrap text-primary-text">
        <span className={assignment.cabinCrew.length >= assignment.cabinRequired ? '' : 'text-invalid'}>
          {assignment.cabinCrew.length} of {assignment.cabinRequired}
        </span>
      </td>
      <td className="px-3 py-3.5 text-sm whitespace-nowrap text-primary-text">
        {local ? (
          <>
            {local.name}
            {language && (
              <span className="ml-1.5 rounded-full bg-page-bg px-2 py-0.5 text-[10px] font-bold text-primary-text/60">
                {countryTag(language)}
              </span>
            )}
          </>
        ) : (
          '—'
        )}
      </td>
      <td className="px-3 py-3.5 text-sm text-primary-text">
        {assignment.police.length === 0 && '—'}
        {assignment.police.map((member) => (
          <span key={member.id} className="block whitespace-nowrap">
            {member.name}
          </span>
        ))}
        {state.kind === 'break' && state.subjectId && !assignment.police.some((member) => member.id === state.subjectId) && (
          <span className="block font-bold text-invalid">no seat</span>
        )}
      </td>
      <td className="px-3 py-3.5">
        <StatusPill state={state} />
      </td>
      <td className="px-3 py-3.5 text-center whitespace-nowrap">
        <ActionButton state={state} legId={assignment.leg.legId} onSickCall={onSickCall} onFindCover={onFindCover} />
      </td>
    </tr>
  )
}

function ActionButton({
  state,
  legId,
  onSickCall,
  onFindCover,
}: {
  state: LegState
  legId: string
  onSickCall: (legId: string) => void
  onFindCover: (legId: string) => void
}) {
  if (state.kind === 'ok') {
    return (
      <Button variant="outline" className="min-w-28 px-3! py-1.5! text-xs" onClick={() => onSickCall(legId)}>
        Sick call
      </Button>
    )
  }
  return (
    <Button className="min-w-28 px-3! py-1.5! text-xs" onClick={() => onFindCover(legId)}>
      {state.kind === 'uncovered' ? 'Find cover →' : 'Review →'}
    </Button>
  )
}

/** `/` joined local crew for the phone card, e.g. `Y. Sato (JP)`. */
function localText(assignment: LegAssignment): string {
  if (!assignment.leg.international) return '—'
  return (
    assignment.localCrew
      .map((member: CrewMember) => {
        const language = member.languages.find((code) => assignment.leg.localLanguages.includes(code))
        return language ? `${member.name} (${countryTag(language)})` : member.name
      })
      .join(', ') || '—'
  )
}

function StatusPill({ state }: { state: LegState }) {
  const label = state.kind === 'ok' ? 'OK' : state.kind === 'uncovered' ? 'Not covered' : state.label
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold whitespace-nowrap ${
        state.kind === 'ok' ? 'bg-valid-bg text-valid' : 'bg-invalid-bg text-invalid'
      }`}
    >
      {label}
    </span>
  )
}

function Gap({ children }: { children: ReactNode }) {
  return <span className="font-bold text-invalid">{children}</span>
}

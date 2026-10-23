import type { Pairing, PairingEvaluation } from '../types/types'
import { formatRoute, formatTime } from '../types/format'
import { Button, CrossIcon, CheckIcon, PencilIcon, StatusBadge, TrashIcon } from '../../shared/ui'

/**
 * Right-hand inspector for the selected pairing: full route, the flight
 * schedule grouped by day, layover, the legality check list and the actions.
 *
 * Every value comes from `PairingEvaluation`, which is recomputed from the legs
 * on every render — the status badge and the checks cannot drift apart.
 */
export function PairingDetailInspector({
  pairing,
  evaluation,
  onEditLegs,
  onDelete,
}: {
  pairing: Pairing
  evaluation: PairingEvaluation
  onEditLegs: () => void
  onDelete: () => void
}) {
  return (
    <aside className="flex flex-col gap-5 rounded-2xl border border-border-desc/30 bg-card-bg px-6 py-5">
      <header className="flex items-start justify-between gap-3">
        <h2 className="text-lg font-extrabold text-primary-text">
          <span className="font-display">{pairing.id}</span>
          <span className="font-sans"> · {formatRoute(evaluation.route)}</span>
        </h2>
        <StatusBadge status={evaluation.status} />
      </header>

      <section>
        <SectionLabel>Flight schedule</SectionLabel>
        <div className="flex flex-col">
          {evaluation.scheduleByDay.map((day) => (
            <div key={day.dateLabel} className="mb-3">
              <p className="mb-2 text-xs font-medium text-primary-text/55">{day.dateLabel}</p>
              <ul className="flex flex-col">
                {day.rows.map((row) => (
                  <li key={row.leg.flightId} className="flex items-baseline justify-between gap-3 py-1">
                    <span className="flex flex-wrap items-baseline gap-2">
                      <span className="font-semibold text-primary-text">
                        {row.leg.origin} ➔ {row.leg.destination}
                      </span>
                      <span className="text-sm font-medium text-primary-text">
                        {formatTime(row.leg.departureAt)}–{formatTime(row.leg.arrivalAt)}
                      </span>
                      <span className="text-xs font-medium text-primary-text/50">{row.leg.flightNumber}</span>
                    </span>
                    <span className="shrink-0 text-xs font-medium text-primary-text/55">{row.durationLabel}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="flex items-baseline justify-between gap-3 border-t border-border-desc/20 pt-3">
          <span className="text-xs text-primary-text/55">Layover</span>
          <span className={`text-sm font-medium ${evaluation.layoverIsError ? 'text-invalid' : 'text-primary-text/85'}`}>
            {evaluation.layoverLabel}
          </span>
        </div>
      </section>

      <section>
        <SectionLabel>Checks</SectionLabel>
        <ul className="flex flex-col gap-2.5">
          {evaluation.checks.map((check) => {
            const passed = check.status === 'passed'
            return (
              <li key={check.code} className="flex items-start gap-2.5">
                <span className={`mt-0.5 shrink-0 ${passed ? 'text-valid' : 'text-invalid'}`}>
                  {passed ? <CheckIcon className="h-4 w-4" /> : <CrossIcon className="h-4 w-4" />}
                </span>
                <span className="flex flex-1 items-baseline justify-between gap-3">
                  <span className={`text-sm ${passed ? 'text-primary-text/80' : 'text-primary-text font-medium'}`}>{check.label}</span>
                  <span className={`shrink-0 text-xs font-medium ${passed ? 'text-primary-text/55' : 'text-invalid'}`}>{check.value}</span>
                </span>
              </li>
            )
          })}
        </ul>
      </section>

      {evaluation.primaryError && (
        <div role="alert" className="rounded-lg border border-invalid/30 bg-invalid-bg px-4 py-3 text-sm text-invalid">
          <p className="font-bold">{evaluation.primaryError.code}</p>
          <p className="mt-1">{evaluation.primaryError.detail}</p>
        </div>
      )}

      <footer className="mt-auto flex gap-3 border-t border-border-desc/20 pt-4">
        <Button variant="outline" onClick={onEditLegs}>
          <PencilIcon className="h-4 w-4" />
          Edit legs
        </Button>
        <Button variant="danger" onClick={onDelete}>
          <TrashIcon className="h-4 w-4" />
          Delete pairing
        </Button>
      </footer>
    </aside>
  )
}

function SectionLabel({ children }: { children: string }) {
  return <p className="mb-3 text-[11px] font-semibold tracking-widest text-primary-text/45 uppercase">{children}</p>
}

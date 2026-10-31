import type { PairingFix } from '../types/pairing-engine'
import type { Pairing, PairingEvaluation } from '../types/types'
import { formatTime } from '../types/format'
import { Button, CheckIcon, CloseIcon, CrossIcon, MinusIcon, PencilIcon, StatusBadge } from '../../shared/ui'
import { RouteText } from './route-text'

/**
 * Inspector for the selected pairing: route, flight schedule by day, layover, the
 * legality checks and the actions. It is the right-hand card on a wide screen and the
 * body of the bottom sheet on a narrow one (`onClose` is only passed for the sheet).
 *
 * Every value comes from `PairingEvaluation`, which is recomputed from the legs on
 * every render, so the status badge and the checks cannot drift apart.
 */
export function PairingDetailInspector({
  pairing,
  evaluation,
  fixes,
  isSaving,
  onApplyFix,
  onEditLegs,
  onDelete,
  onClose,
}: {
  pairing: Pairing
  evaluation: PairingEvaluation
  /** One-step repairs for an Invalid pairing; empty when it is Valid or has none. */
  fixes: readonly PairingFix[]
  isSaving: boolean
  onApplyFix: (fix: PairingFix) => void
  onEditLegs: () => void
  onDelete: () => void
  onClose?: () => void
}) {
  const committed = pairing.rosterRunId != null
  const invalid = evaluation.status === 'failed' && !committed
  // The "each flight leaves where the last landed" row only earns its place once it fails.
  const checks = evaluation.checks.filter((check) => check.code !== 'SEQUENCE_BROKEN' || check.status === 'failed')

  return (
    <aside className={`flex flex-col gap-5 ${onClose ? '' : 'rounded-2xl border border-border-desc/40 bg-card-bg px-5 py-5 sm:px-5'}`}>
      <header className="flex items-center justify-between gap-3 border-b border-border-desc/40 pb-3">
        <h2 className="flex flex-wrap items-center gap-x-2 text-base font-extrabold text-primary-text sm:text-lg">
          <span>{pairing.code}</span>
          <span aria-hidden="true">·</span>
          <RouteText route={evaluation.route} arrowClassName="text-primary-text" />
        </h2>
        <span className="flex shrink-0 items-center gap-2">
          {committed ? (
            <span className="rounded-full bg-info-bg px-3 py-1 text-xs font-bold text-blue-700">Committed</span>
          ) : (
            <StatusBadge status={evaluation.status} />
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-md p-1 text-primary-text/60 transition-colors hover:bg-page-bg hover:text-primary-text"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          )}
        </span>
      </header>

      <section>
        <SectionLabel>Flight schedule</SectionLabel>
        <div className="flex flex-col">
          {evaluation.scheduleByDay.map((day) => (
            <div key={day.dateLabel}>
              <p className="mb-1 text-xs text-primary-text/60">{day.dateLabel}</p>
              <ul className="mb-2 flex flex-col">
                {day.rows.map((row) => (
                  <li
                    key={row.leg.flightId}
                    className="flex items-baseline justify-between gap-3 border-b border-border-desc/30 py-1.5 last:border-b-0"
                  >
                    <span className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                      <span className="font-bold text-primary-text">
                        {row.leg.origin} → {row.leg.destination}
                      </span>
                      <span className="text-sm font-bold text-primary-text">
                        {formatTime(row.leg.departureAt)}–{formatTime(row.leg.arrivalAt)}
                      </span>
                      <span className="text-sm text-primary-text/50">{row.leg.flightNumber}</span>
                    </span>
                    <span className="shrink-0 text-xs text-primary-text/55">{row.durationLabel}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="flex items-baseline justify-between gap-4 border-t border-border-desc/40 pt-3">
          <span className="text-sm text-primary-text/60">Layover</span>
          <span className={`text-right text-sm font-bold ${evaluation.layoverIsError ? 'text-invalid' : 'text-primary-text'}`}>
            {evaluation.layoverLabel}
          </span>
        </div>
      </section>

      <section>
        <SectionLabel>Checks</SectionLabel>
        <ul className="flex flex-col gap-2">
          {checks.map((check) => {
            const passed = check.status === 'passed'
            return (
              <li key={check.code} className="flex items-center gap-2.5">
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                    passed ? 'bg-valid-bg text-valid' : 'bg-invalid-bg text-invalid'
                  }`}
                >
                  {passed ? <CheckIcon className="h-3 w-3" /> : <CrossIcon className="h-3 w-3" />}
                </span>
                <span className="flex flex-1 items-baseline justify-between gap-3">
                  <span className="text-sm text-primary-text">{check.label}</span>
                  <span className={`shrink-0 text-sm font-bold ${passed ? 'text-primary-text/70' : 'text-invalid'}`}>{check.value}</span>
                </span>
              </li>
            )
          })}
        </ul>
      </section>

      {evaluation.primaryError && !committed && (
        <p role="alert" className="rounded-lg border border-invalid/30 bg-invalid/5 px-3.5 py-2.5 text-sm text-invalid">
          {evaluation.primaryError.code} · {evaluation.primaryError.detail}
        </p>
      )}

      {invalid && (
        <section>
          <SectionLabel>How to fix</SectionLabel>
          {fixes.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {fixes.map((fix) => (
                <li
                  key={fix.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-valid/30 bg-green-tint px-3.5 py-2.5"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-primary-text">{fix.title}</span>
                    <span className="block text-xs text-primary-text/60">{fix.detail}</span>
                  </span>
                  <Button variant="primary" className="shrink-0 px-3 py-1.5" disabled={isSaving} onClick={() => onApplyFix(fix)}>
                    Apply · Valid
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-primary-text/60">
              No single change makes this pairing valid. Use Edit legs to add, remove or reorder flights, or delete it.
            </p>
          )}
        </section>
      )}

      {committed ? (
        <p className="rounded-lg bg-info-bg px-4 py-3 text-sm text-primary">
          This pairing is already committed to a roster run, so it is not edited here. Continue to Assign crew to crew it.
        </p>
      ) : (
        <footer className={`flex gap-3 ${invalid ? 'border-t border-border-desc/40 pt-4' : ''} ${onClose ? 'justify-center' : ''}`}>
          <Button variant={invalid ? 'primary' : 'outline'} onClick={onEditLegs}>
            <PencilIcon className="h-4 w-4" />
            Edit legs
          </Button>
          <Button variant="danger" onClick={onDelete}>
            <MinusIcon className="h-4 w-4" />
            Delete pairing
          </Button>
        </footer>
      )}
    </aside>
  )
}

function SectionLabel({ children }: { children: string }) {
  return <p className="mb-2.5 text-[11px] font-semibold tracking-widest text-primary-text/50 uppercase">{children}</p>
}

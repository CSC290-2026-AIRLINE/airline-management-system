/**
 * The last gate before publishing: one row per pairing.
 *
 * Publish is refused while any break is open, so this table's job is to make the
 * refusal legible — it says *which pairing* is not ready and *why*, rather than
 * disabling a button and leaving the operator to count breaks on the left. An override
 * counts as closed here, because it is: the point of the table is what publishing will
 * do, not what the rules say.
 */
import { InfoBox } from '../../build-pairings/components/ui'
import type { PublishCheck } from '../types/types'

interface PublishChecksProps {
  checks: readonly PublishCheck[]
  openCount: number
  overriddenCount: number
  isPublished: boolean
}

export function PublishChecks({ checks, openCount, overriddenCount, isPublished }: PublishChecksProps) {
  const remaining = `${openCount} open ${openCount === 1 ? 'break' : 'breaks'}`
  const headline = isPublished || openCount === 0 ? `${isPublished ? 'Published' : 'Ready to publish'} · ${remaining}` : remaining
  const subtitle = overriddenCount > 0 ? `${headline} · ${overriddenCount} overridden` : headline

  return (
    <section className="overflow-hidden rounded-2xl border border-border-desc/40 bg-card-bg">
      <header className="border-b border-border-desc/30 px-5 py-4 sm:px-6 sm:py-5">
        <h2 className="text-lg font-extrabold tracking-tight text-primary-text">Publish checks</h2>
        <p className="mt-1 text-sm text-primary-text/60">{subtitle}</p>
      </header>

      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-border-desc/30">
              {['Check', 'Date', 'Base', 'Detail', 'Publish status'].map((heading) => (
                <th
                  key={heading}
                  scope="col"
                  className="px-6 py-3 text-[11px] font-semibold tracking-widest text-primary-text/60 uppercase"
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {checks.map((check) => (
              <tr key={check.pairingId} className="border-b border-border-desc/20 last:border-b-0">
                <td className="px-6 py-3.5 text-sm font-bold text-primary-text">{check.pairingId}</td>
                <td className="px-6 py-3.5 text-sm text-primary-text/70">{check.dateLabel}</td>
                <td className="px-6 py-3.5 text-sm text-primary-text/70">{check.base}</td>
                <td className="px-6 py-3.5 text-sm text-primary-text/70">{check.detail}</td>
                <td className="px-6 py-3.5">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                      check.tone === 'good' ? 'bg-valid-bg text-valid' : 'bg-invalid-bg text-invalid'
                    }`}
                  >
                    {check.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="flex flex-col lg:hidden">
        {checks.map((check) => (
          <li key={check.pairingId} className="border-b border-border-desc/25 px-5 py-4 last:border-b-0">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm font-bold text-primary-text">
                {check.pairingId} <span className="font-normal text-primary-text/60">{check.dateLabel}</span>
              </p>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                  check.tone === 'good' ? 'bg-valid-bg text-valid' : 'bg-invalid-bg text-invalid'
                }`}
              >
                {check.status}
              </span>
            </div>
            <p className="mt-1 text-xs text-primary-text/70">{check.detail}</p>
          </li>
        ))}
      </ul>

      <div className="border-t border-border-desc/30 px-5 py-4 sm:px-6">
        <p className="text-[11px] font-bold tracking-widest text-primary-text/50 uppercase">Publication rule</p>
        <div className="mt-2">
          <InfoBox>
            Publishing sends every leg and duty to the crew on it and closes the run. Later changes — a sick call, a delay, a cancellation —
            are re-checked against the same six rules and re-sent to the crew affected.
          </InfoBox>
        </div>
      </div>
    </section>
  )
}

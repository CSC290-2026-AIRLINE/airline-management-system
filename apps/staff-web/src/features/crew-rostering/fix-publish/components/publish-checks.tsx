/**
 * The last gate before publishing: one row per pairing.
 *
 * Publish is refused while any break is open, so this table's job is to make the
 * refusal legible — it says *which pairing* is not ready and *why*, rather than
 * disabling a button and leaving the operator to count breaks on the left. An override
 * counts as closed here, because it is: the point of the table is what publishing will
 * do, not what the rules say.
 *
 * Desktop is a table. A phone gets the same rows as tiles inside one card.
 */
import { CheckIcon } from '../../shared/ui'
import type { FixBreak, PublishCheck } from '../types/types'

interface PublishChecksProps {
  checks: readonly PublishCheck[]
  openBreaks: readonly FixBreak[]
  overriddenCount: number
  isPublished: boolean
}

const PUBLICATION_RULE =
  'Publishing closes the run to automatic crewing. Later changes — a sick call, a delay, a cancellation — are re-checked against the same rules. Notifying the crew is Feature 13 and is not connected yet.'

/** `0 open breaks`, `1 leg not covered`, `1 open break (POLICE_NO_SEAT)` — what is still in the way. */
function remainingLabel(openBreaks: readonly FixBreak[], isPublished: boolean): string {
  const count = openBreaks.length
  if (!isPublished || count === 0) return `${count} open ${count === 1 ? 'break' : 'breaks'}`
  const seats = openBreaks.every((item) => item.code === 'NO_LEGAL_CREW' || item.removed)
  if (seats) return `${count} ${count === 1 ? 'leg' : 'legs'} not covered`
  const codes = [...new Set(openBreaks.map((item) => item.code))].join(', ')
  return `${count} open ${count === 1 ? 'break' : 'breaks'} (${codes})`
}

export function PublishChecks({ checks, openBreaks, overriddenCount, isPublished }: PublishChecksProps) {
  const remaining = remainingLabel(openBreaks, isPublished)
  const headline = isPublished ? `Published · ${remaining}` : openBreaks.length === 0 ? `Ready to publish · ${remaining}` : remaining
  const subtitle = overriddenCount > 0 ? `${headline} · ${overriddenCount} overridden` : headline
  const phoneTitle = isPublished ? 'Published' : openBreaks.length === 0 ? 'Ready to publish' : 'Publish checks'

  return (
    <>
      <section className="hidden rounded-2xl border border-border-desc/40 bg-card-bg p-7 lg:block">
        <h2 className="text-2xl font-extrabold tracking-tight text-primary-text">Publish checks</h2>
        <p className="mt-1.5 text-sm text-primary-text/60">{subtitle}</p>

        <table className="mt-5 w-full border-collapse text-left">
          <thead>
            <tr className="bg-table-head">
              {['Check', 'Date', 'Base', 'Detail', 'Publish status'].map((heading) => (
                <th key={heading} scope="col" className="px-4 py-4 text-xs font-bold tracking-wider text-primary-text uppercase">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {checks.map((check) => (
              <tr key={check.pairingId} className="border-b border-border-desc/40">
                <td className="px-4 py-4 text-sm text-primary-text">{check.pairingId}</td>
                <td className="px-4 py-4 text-sm whitespace-nowrap text-primary-text">{check.dateLabel}</td>
                <td className="px-4 py-4 text-sm text-primary-text">{check.base}</td>
                <td className="px-4 py-4 text-sm text-primary-text">{check.detail}</td>
                <td className={`px-4 py-4 text-sm font-bold whitespace-nowrap ${check.tone === 'good' ? 'text-valid' : 'text-invalid'}`}>
                  {check.status}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-6 rounded-xl bg-info-bg px-5 py-5">
          <p className="text-sm font-bold text-primary-text">Publication rule</p>
          <p className="mt-2 text-xs leading-relaxed text-primary-text/55">{PUBLICATION_RULE}</p>
        </div>
      </section>

      <section className="rounded-2xl border border-border-desc/40 bg-card-bg p-5 lg:hidden">
        {isPublished && (
          <span className="mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-valid text-white">
            <CheckIcon className="h-4 w-4" />
          </span>
        )}
        <h2 className="text-xl font-extrabold tracking-tight text-primary-text">{phoneTitle}</h2>
        <p className="mt-1 text-xs leading-relaxed text-primary-text/55">{subtitle}</p>

        <ul className="mt-3 flex flex-col gap-3">
          {checks.map((check) => (
            <li
              key={check.pairingId}
              className={`rounded-xl border px-4 py-3 ${check.tone === 'good' ? 'border-valid bg-green-tint' : 'border-invalid/50 bg-green-tint'}`}
            >
              <p className="text-sm font-extrabold text-primary-text">
                {check.pairingId} · {check.dateLabel} · {check.base}
              </p>
              <p className={`mt-1 text-xs ${check.tone === 'good' ? 'text-primary-text/55' : 'text-invalid'}`}>{check.detail}</p>
            </li>
          ))}
          <li className="rounded-xl bg-band-bg px-4 py-3">
            <p className="text-xs font-extrabold tracking-wider text-primary-text uppercase">Publication rule</p>
            <p className="mt-1.5 text-xs leading-relaxed text-primary-text/55">{PUBLICATION_RULE}</p>
          </li>
        </ul>
      </section>
    </>
  )
}

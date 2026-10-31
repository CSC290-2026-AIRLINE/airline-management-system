/**
 * Everything already closed, with what closed it.
 *
 * This is the audit view: one row per break and the resolution in two words, so the
 * roster can be handed on without anybody having to remember which breaks there were.
 * The override reason is deliberately not a column — it is in the panel and in the
 * audit log (Feature 15), and repeating a paragraph of free text in a table makes the
 * one column that matters unreadable.
 *
 * Desktop only: on a phone the same news is the banner and the "Ready to publish" card.
 */
import { dayMonthYear } from '../types/labels'
import type { FixBreak, LegAssignment } from '../types/types'

interface ClosedListProps {
  breaks: readonly FixBreak[]
  rosterFor: (legId: string) => LegAssignment | undefined
}

export function ClosedList({ breaks, rosterFor }: ClosedListProps) {
  const overridden = breaks.filter((item) => item.resolution?.kind === 'overridden').length
  const allFixed = overridden === 0

  return (
    <section className="hidden rounded-2xl border border-border-desc/40 bg-card-bg p-7 lg:block">
      <h2 className="text-2xl font-extrabold tracking-tight text-primary-text">{allFixed ? 'All breaks fixed' : 'All breaks closed'}</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-primary-text/60">
        Every leg now passes the law and company rules. Publishing locks the run; later changes are re-checked.
      </p>

      <table className="mt-5 w-full border-collapse text-left">
        <thead>
          <tr className="bg-table-head">
            {['Date', 'Flight', 'Route', 'Pairing', 'Status', 'Action'].map((heading) => (
              <th key={heading} scope="col" className="px-4 py-4 text-xs font-bold tracking-wider text-primary-text uppercase">
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {breaks.map((item) => {
            const leg = rosterFor(item.legId)?.leg
            const overriddenItem = item.resolution?.kind === 'overridden'
            return (
              <tr key={item.id} className="border-b border-border-desc/40">
                <td className="px-4 py-4 text-sm text-primary-text">{leg ? dayMonthYear(leg.departureAt) : '—'}</td>
                <td className="px-4 py-4 text-sm text-primary-text">{item.flightNumber}</td>
                <td className="px-4 py-4 text-sm whitespace-nowrap text-primary-text">
                  {leg ? `${leg.origin} → ${leg.destination}` : '—'}
                </td>
                <td className="px-4 py-4 text-sm text-primary-text">{item.pairingCode}</td>
                <td className={`max-w-48 px-4 py-4 text-sm leading-snug ${overriddenItem ? 'text-amber-ink' : 'text-valid'}`}>
                  {overriddenItem ? 'Overridden' : 'Fixed'} · {item.resolution?.short}
                </td>
                <td className="px-4 py-4 text-sm text-blue-600">—</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}

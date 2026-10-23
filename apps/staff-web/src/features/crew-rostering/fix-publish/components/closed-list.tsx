/**
 * Everything already closed, with what closed it.
 *
 * This is the audit view: one row per break and the resolution in two words, so the
 * roster can be handed on without anybody having to remember which breaks there were.
 * The override reason is deliberately not a column — it is in the panel and in the
 * audit log (Feature 15), and repeating a paragraph of free text in a table makes the
 * one column that matters unreadable.
 */
import { formatFullDay } from '../../build-pairings/types/format'
import type { FixBreak, LegAssignment } from '../types/types'

interface ClosedListProps {
  breaks: readonly FixBreak[]
  rosterFor: (legId: string) => LegAssignment | undefined
}

export function ClosedList({ breaks, rosterFor }: ClosedListProps) {
  const fixed = breaks.filter((item) => item.resolution?.kind === 'fixed').length
  const overridden = breaks.length - fixed
  const allFixed = overridden === 0

  return (
    <section className="overflow-hidden rounded-2xl border border-border-desc/40 bg-card-bg">
      <header className="border-b border-border-desc/30 px-5 py-4 sm:px-6">
        <h2 className="text-lg font-extrabold tracking-tight text-primary-text">{allFixed ? 'All breaks fixed' : 'All breaks closed'}</h2>
        <p className="mt-1 text-sm leading-relaxed text-primary-text/60">
          Every leg now passes the law and company rules. Publishing sends each crew member their duties (Feature 13).
        </p>
      </header>

      <table className="hidden w-full border-collapse text-left lg:table">
        <thead>
          <tr className="border-b border-border-desc/30">
            {['Date', 'Flight', 'Route', 'Pairing', 'Status', 'Action'].map((heading) => (
              <th key={heading} scope="col" className="px-6 py-3 text-[11px] font-semibold tracking-widest text-primary-text/60 uppercase">
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
              <tr key={item.id} className="border-b border-border-desc/20 last:border-b-0">
                <td className="px-6 py-3.5 text-sm text-primary-text/70">{leg ? formatFullDay(leg.departureAt) : '—'}</td>
                <td className="px-6 py-3.5 text-sm font-bold text-primary-text">{item.flightNumber}</td>
                <td className="px-6 py-3.5 text-sm text-primary-text/70">{leg ? `${leg.origin} → ${leg.destination}` : '—'}</td>
                <td className="px-6 py-3.5 text-sm text-primary-text/70">{item.pairingId}</td>
                <td className="px-6 py-3.5">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                      overriddenItem ? 'bg-secondary/15 text-secondary' : 'bg-valid-bg text-valid'
                    }`}
                  >
                    {overriddenItem ? 'Overridden' : 'Fixed'} · {item.resolution?.short}
                  </span>
                </td>
                <td className="px-6 py-3.5 text-sm text-primary-text/50">—</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {/* Below `lg` the table would need a horizontal scroll to stay legible, so the
          rows stack into cards instead. Same data, no overflow. */}
      <ul className="flex flex-col lg:hidden">
        {breaks.map((item) => {
          const leg = rosterFor(item.legId)?.leg
          const overriddenItem = item.resolution?.kind === 'overridden'
          return (
            <li key={item.id} className="border-b border-border-desc/25 px-5 py-4 last:border-b-0">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-bold text-primary-text">
                  {item.flightNumber} <span className="font-normal text-primary-text/60">{item.pairingId}</span>
                </p>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                    overriddenItem ? 'bg-secondary/15 text-secondary' : 'bg-valid-bg text-valid'
                  }`}
                >
                  {overriddenItem ? 'Overridden' : 'Fixed'} · {item.resolution?.short}
                </span>
              </div>
              {leg && (
                <p className="mt-1 text-xs text-primary-text/60">
                  {formatFullDay(leg.departureAt)} · {leg.origin} → {leg.destination}
                </p>
              )}
              <p className="mt-1.5 text-xs text-primary-text/70">{item.resolution?.summary}</p>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

import type { CrewMetrics } from '../types/types'

/**
 * The four headline counts. They describe the whole roster, not the filtered
 * table, so narrowing the search never moves these numbers.
 *
 * A 2 x 2 grid on a phone, four across from `lg`.
 */
export function CrewSummaryCards({ metrics }: { metrics: CrewMetrics }) {
  const cards = [
    { label: 'Total crew', value: metrics.totalCrew },
    { label: 'Pilots', value: metrics.pilots },
    { label: 'Cabin crew', value: metrics.cabinCrew },
    { label: 'Flight police', value: metrics.flightPolice },
  ]
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
      {cards.map((card) => (
        <div key={card.label} className="rounded-xl border border-border-desc/40 bg-card-bg px-4 py-3.5 lg:rounded-2xl lg:px-5 lg:py-4">
          <p className="text-[11px] font-semibold tracking-wider text-primary-text/55 uppercase">{card.label}</p>
          <p className="mt-1 text-3xl leading-none font-extrabold text-primary-text lg:mt-1.5">{card.value}</p>
        </div>
      ))}
    </div>
  )
}

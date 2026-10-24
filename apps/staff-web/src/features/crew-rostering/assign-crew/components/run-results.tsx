/**
 * The two blocks that frame the crew table: the empty state before a run, and the three
 * count cards after one.
 */
import { EmptyFaceIcon } from '../../shared/ui'
import type { AssignmentSummary } from '../types/types'

/** Shown until auto-assign has been run for the window. */
export function NoCrewAssigned({ committedCount }: { committedCount: number }) {
  return (
    <section className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-border-desc/40 bg-card-bg px-6 py-12 text-center lg:min-h-64">
      <EmptyFaceIcon className="h-12 w-12 text-slate lg:h-14 lg:w-14" />
      <h2 className="mt-5 text-lg font-bold text-primary-text">No crew assigned yet</h2>
      <p className="mt-2 max-w-xl text-sm text-primary-text/55">
        Run auto-assign to fill every leg of the {committedCount} committed {committedCount === 1 ? 'pairing' : 'pairings'}. Coverage and
        rule breaks show up here.
      </p>
    </section>
  )
}

/** Flight legs, fully crewed legs and open breaks, taken from the stored run. */
export function RunStatCards({ summary }: { summary: AssignmentSummary }) {
  const cards = [
    { label: 'Flight legs', value: summary.totalLegs, tone: 'text-primary-text' },
    { label: 'Fully crewed', value: summary.fullyCrewedLegs, tone: 'text-primary-text' },
    { label: 'Open breaks', value: summary.breakCount, tone: 'text-primary-text' },
  ]
  return (
    <div className="grid grid-cols-3 gap-3 lg:gap-5">
      {cards.map((card) => (
        <div key={card.label} className="rounded-2xl border border-border-desc/40 bg-card-bg px-4 py-4 lg:px-7 lg:py-6">
          <p className="text-xs text-primary-text/60 lg:text-sm">{card.label}</p>
          <p className={`mt-2 text-3xl leading-none font-extrabold lg:mt-3 lg:text-4xl ${card.tone}`}>{card.value}</p>
        </div>
      ))}
    </div>
  )
}

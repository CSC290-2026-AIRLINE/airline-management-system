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
    { label: 'Flight legs', value: summary.totalLegs, tint: 'bg-page-bg' },
    { label: 'Fully crewed', value: summary.fullyCrewedLegs, tint: 'bg-green-tint' },
    { label: 'Open breaks', value: summary.breakCount, tint: 'bg-invalid-bg' },
  ]
  return (
    <>
      {/* Desktop: three separate cards, label above the number. */}
      <div className="hidden grid-cols-3 gap-5 lg:grid">
        {cards.map((card) => (
          <div key={card.label} className="rounded-2xl border border-border-desc/40 bg-card-bg px-7 py-6">
            <p className="text-sm text-primary-text/60">{card.label}</p>
            <p className="mt-3 text-4xl leading-none font-extrabold text-primary-text">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Phone: one "Run results" card of tinted tiles, number above the label. */}
      <section className="rounded-2xl border border-border-desc/40 bg-card-bg p-5 lg:hidden">
        <h2 className="text-lg font-bold text-primary-text">Run results</h2>
        <div className="mt-3 grid grid-cols-3 gap-2.5">
          {cards.map((card) => (
            <div key={card.label} className={`rounded-xl px-3.5 py-3.5 ${card.tint}`}>
              <p className="text-3xl leading-none font-extrabold text-primary-text">{card.value}</p>
              <p className="mt-2 text-xs font-semibold text-primary-text/70">{card.label}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  )
}

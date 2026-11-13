/**
 * The "Rules used" card.
 *
 * The list is data, not copy in a component: `displayRules` numbers each rule, builds its
 * label from the run's `crew_setting` limits and records whether a break under it is law or
 * a company rule.
 */
import { displayRules, rosterRulesNote } from '../types/roster-rules'
import type { RuleLimits } from '../types/types'

function RuleItem({ number, label }: { number: number; label: string }) {
  return (
    <li className="flex items-center gap-3 rounded-xl bg-page-bg/70 px-4 py-3.5">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
        {number}
      </span>
      <span className="text-sm leading-snug font-semibold text-primary-text">{label}</span>
    </li>
  )
}

export function RulesCard({ limits, aircraftType }: { limits: RuleLimits; aircraftType?: string }) {
  return (
    <section className="rounded-2xl border border-border-desc/40 bg-card-bg p-7">
      <h2 className="text-xl font-bold text-primary-text">Rules used</h2>
      <p className="mt-2 text-sm leading-relaxed text-primary-text/60">
        Auto-assign fills every leg, then checks each assignment against these rules. Where a destination country has a stricter limit, the
        strictest rule wins.
      </p>

      <ol className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {displayRules(limits).map((rule) => (
          <RuleItem key={rule.code} number={rule.number} label={rule.label} />
        ))}
      </ol>

      <p className="mt-4 rounded-lg bg-info-bg px-4 py-3 text-xs leading-relaxed text-primary">{rosterRulesNote(limits, aircraftType)}</p>
    </section>
  )
}

/** Phone variant: a single column, with the description trimmed to fit. */
export function RulesCardCompact({ limits, aircraftType }: { limits: RuleLimits; aircraftType?: string }) {
  return (
    <section className="rounded-2xl border border-border-desc/40 bg-card-bg p-5">
      <h2 className="text-lg font-bold text-primary-text">Rules used</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-primary-text/60">
        Every assignment is checked against these. The strictest country rule wins.
      </p>
      <ol className="mt-4 flex flex-col gap-2.5">
        {displayRules(limits).map((rule) => (
          <RuleItem key={rule.code} number={rule.number} label={rule.label} />
        ))}
      </ol>
      <p className="mt-4 rounded-lg bg-info-bg px-4 py-3 text-xs leading-relaxed text-primary">{rosterRulesNote(limits, aircraftType)}</p>
    </section>
  )
}

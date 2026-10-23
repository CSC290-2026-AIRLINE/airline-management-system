/**
 * The "Rules used" card.
 *
 * The list is data, not copy in a component: `ROSTER_RULES` numbers each rule and
 * records whether a break under it is law or a company rule, which is what the
 * footnote and the break cards rely on.
 */
import { InfoBox } from '../../shared/ui'
import { ROSTER_RULES, RULES_FOOTNOTE } from '../types/crew-engine'

export function RulesCard() {
  return (
    <section className="rounded-2xl border border-border-desc/40 bg-card-bg p-5 lg:p-7">
      <h2 className="text-xl font-bold text-primary-text lg:text-2xl">Rules used</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-primary-text/60">
        Auto-assign fills every leg, then checks each assignment against these rules. Where a destination country has a stricter limit, the
        strictest rule wins.
      </p>

      <ol className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ROSTER_RULES.map((rule) => (
          <li key={rule.code} className="flex items-start gap-3 rounded-xl bg-page-bg px-4 py-3.5">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
              {rule.number}
            </span>
            <span className="text-sm leading-snug font-medium text-primary-text">{rule.label}</span>
          </li>
        ))}
      </ol>

      <div className="mt-5">
        <InfoBox>{RULES_FOOTNOTE}</InfoBox>
      </div>
    </section>
  )
}

/** One-line variant used on mobile, where the description is trimmed to fit. */
export function RulesCardCompact() {
  return (
    <section className="rounded-2xl border border-border-desc/40 bg-card-bg p-5">
      <h2 className="text-lg font-bold text-primary-text">Rules used</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-primary-text/60">
        Every assignment is checked against these. The strictest country rule wins.
      </p>
      <ol className="mt-4 flex flex-col gap-2.5">
        {ROSTER_RULES.map((rule) => (
          <li key={rule.code} className="flex items-start gap-3 rounded-xl bg-page-bg px-4 py-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
              {rule.number}
            </span>
            <span className="text-sm leading-snug font-medium text-primary-text">{rule.label}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}

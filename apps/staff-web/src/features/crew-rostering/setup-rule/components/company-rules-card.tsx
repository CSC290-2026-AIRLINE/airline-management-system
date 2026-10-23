import type { CompanyRule } from '../types/types'

/**
 * Company policy lines, sitting on a warm panel to separate them from the
 * legality limits above.
 *
 * These are overridable with a written reason, unlike the limits; the copy on
 * the card is what tells the operator which rules they are allowed to bend.
 */
export function CompanyRulesCard({ rules }: { rules: readonly CompanyRule[] }) {
  return (
    <section className="rounded-xl border border-secondary/35 bg-secondary/12 px-4 py-4 sm:px-5">
      <h2 className="text-base font-bold text-primary-text">Company rules</h2>
      <p className="mt-0.5 text-xs text-primary-text/60">
        Local crew and police coverage can be overridden only with a written reason; Feature 15 records the decision.
      </p>

      <ul className="mt-3 flex flex-wrap gap-2">
        {rules.map((rule) => (
          <li
            key={rule.id}
            className="inline-flex items-center gap-2 rounded-full bg-secondary/25 px-3 py-1.5 text-xs font-medium text-btn-yellow-hover"
          >
            {rule.label}
            {rule.code && (
              <span className="rounded-full bg-card-bg/70 px-2 py-0.5 text-[10px] font-bold tracking-wide text-btn-yellow-hover uppercase">
                {rule.code}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

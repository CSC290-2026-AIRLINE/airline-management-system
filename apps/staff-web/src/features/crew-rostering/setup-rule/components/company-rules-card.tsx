import type { CompanyRule, DefaultLimits } from '../types/types'

/**
 * Company policy lines, set apart from the legality limits above because they can be overridden with a
 * written reason and the limits cannot.
 *
 * The chips are written from the live defaults (`2 police`, `1+ local crew`), so a change to a default
 * reads correctly here without anyone editing copy. Only `POLICE_NO_SEAT` names its reason code, as the
 * mockup does. A phone drops the chips for two sentences and a `Reason + audit` tag.
 */
export function CompanyRulesCard({ rules, defaults }: { rules: readonly CompanyRule[]; defaults: DefaultLimits }) {
  return (
    <>
      <section className="rounded-2xl border border-gold/35 bg-gold/12 px-5 py-4 max-lg:hidden">
        <h2 className="text-lg font-extrabold tracking-tight text-primary-text">Company rules</h2>
        <p className="mt-0.5 text-xs text-primary-text/60">
          Local crew and police coverage can be overridden only with a written reason; Feature 15 records the decision.
        </p>

        <ul className="mt-3 flex flex-wrap gap-2.5">
          {rules.map((rule) => (
            <li
              key={rule.id}
              className="inline-flex items-center rounded-full bg-gold/25 px-4 py-1.5 text-xs font-semibold text-btn-yellow-hover"
            >
              {chipLabel(rule, defaults)}
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col rounded-2xl border border-primary/15 bg-info-bg px-5 py-5 lg:hidden">
        <h2 className="text-lg font-extrabold tracking-tight text-primary-text">Company rules</h2>
        <p className="mt-2 text-xs leading-relaxed text-primary-text/60">
          Local crew and police rules can be overridden only with a reason and audit entry. Law rules (rest, duty, overlap and staffing)
          cannot be overridden.
        </p>
        <span className="mt-6 w-fit rounded-full bg-primary/10 px-3 py-1 text-[11px] font-bold text-blue-700">Reason + audit</span>
      </section>
    </>
  )
}

/** The short chip for a rule, from the numbers the page already holds. */
function chipLabel(rule: CompanyRule, defaults: DefaultLimits): string {
  switch (rule.code) {
    case 'NO_LOCAL_CREW':
      return `${defaults.minLocalCrew}+ local crew per destination`
    case 'POLICE_MIN':
      return `${defaults.minPolice} police · international flights`
    case 'POLICE_NO_SEAT':
      return 'Police need a seat from Feature 3 (POLICE_NO_SEAT)'
    default:
      return rule.label
  }
}

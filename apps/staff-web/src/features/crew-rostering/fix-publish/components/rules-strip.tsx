/**
 * The strip of six rules the page re-checks every fix against.
 *
 * It sits between the progress and the workspace rather than inside either, because it
 * is the promise both of them make: the numbers come from `RULE_LIMITS`, the same
 * constants `evaluateRules` uses, so the strip cannot promise a threshold the engine is
 * not actually enforcing.
 */
import { RULE_CHIPS } from '../types/break-descriptions'

export function RulesStrip() {
  return (
    <section aria-label="Rules applied to every fix" className="rounded-2xl border border-border-desc/40 bg-card-bg px-5 py-5">
      {/* `contents` so the chips join the label's flex line: a wrapped chip starts under
          the label rather than indented past it, which is where the mockups put it. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        <p className="mr-1 text-sm text-primary-text/60">Every fix is re-checked against</p>
        <ol className="contents">
          {RULE_CHIPS.map((rule) => (
            <li key={rule.number} className="rounded-full bg-band-bg px-3 py-1.5 text-[13px] font-medium text-primary-text">
              <span className="font-bold">{rule.number}</span> {rule.label}
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

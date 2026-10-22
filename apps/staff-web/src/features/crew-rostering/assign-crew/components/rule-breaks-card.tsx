/**
 * The rule-break card.
 *
 * A break is written once, by the engine, and shown in both places it matters: as a
 * badge on the leg it belongs to and as a card here. The law/company split in the
 * closing sentence is derived from the breaks themselves, so it changes with the run
 * instead of being copy that can go stale.
 */
import type { RuleBreak } from '../types/types'

/** `ChevronRightIcon` lives in the shared UI file; this one keeps the card self-contained. */
function ChevronRightIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={className} aria-hidden="true">
      <path d="m9 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** `A`, `A and B` — the joining the closing sentence needs. */
function joinCodes(codes: readonly string[]): string {
  if (codes.length <= 1) return codes[0] ?? ''
  return `${codes.slice(0, -1).join(', ')} and ${codes.at(-1)}`
}

export function RuleBreaksCard({ breaks, onOpenFix }: { breaks: readonly RuleBreak[]; onOpenFix: () => void }) {
  const lawCodes = [...new Set(breaks.filter((ruleBreak) => ruleBreak.severity === 'law').map((ruleBreak) => ruleBreak.code))]
  const companyCodes = [...new Set(breaks.filter((ruleBreak) => ruleBreak.severity === 'company').map((ruleBreak) => ruleBreak.code))]

  return (
    <section className="rounded-2xl border border-border-desc/40 bg-card-bg p-5 lg:p-7">
      <h2 className="text-xl font-bold text-primary-text lg:text-2xl">Rule breaks ({breaks.length})</h2>

      <ul className="mt-5 flex flex-col gap-3">
        {breaks.map((ruleBreak) => (
          <li
            key={ruleBreak.id}
            className="group rounded-xl border border-invalid/30 bg-invalid/5 px-4 py-3.5 transition-colors hover:bg-invalid/10"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-bold text-invalid">{ruleBreak.title}</p>
              <div className="flex shrink-0 items-center gap-2">
                <span className="rounded bg-invalid-bg px-2 py-0.5 text-[11px] font-bold text-invalid">{ruleBreak.code}</span>
                <button
                  type="button"
                  onClick={onOpenFix}
                  aria-label={`Open ${ruleBreak.code} in Fix & publish`}
                  className="rounded p-0.5 text-invalid transition-colors hover:bg-invalid/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-invalid"
                >
                  <ChevronRightIcon className="h-4 w-4" />
                </button>
              </div>
            </div>
            <p className="mt-1 text-sm leading-relaxed text-primary-text/75">{ruleBreak.detail}</p>

            {/* Only a law break can be resolved by a swap, so only a law break promises one. */}
            {ruleBreak.severity === 'law' && (
              <span
                role="tooltip"
                className="pointer-events-none mt-2 hidden rounded-md bg-primary px-2.5 py-1.5 text-[12px] font-medium text-white group-hover:block group-focus-within:block"
              >
                Open in Fix &amp; publish to swap crew
              </span>
            )}
          </li>
        ))}
      </ul>

      {(lawCodes.length > 0 || companyCodes.length > 0) && (
        <p className="mt-4 text-[13px] leading-relaxed text-primary-text/55">
          {lawCodes.length > 0 && (
            <>
              {joinCodes(lawCodes)} {lawCodes.length === 1 ? 'is a law rule, so it must' : 'are law rules, so they must'} be fixed with a
              swap.{' '}
            </>
          )}
          {companyCodes.length > 0 && (
            <>
              {joinCodes(companyCodes)} {companyCodes.length === 1 ? 'is a company rule' : 'are company rules'}: fix them or override with a
              written reason.
            </>
          )}
        </p>
      )}
    </section>
  )
}

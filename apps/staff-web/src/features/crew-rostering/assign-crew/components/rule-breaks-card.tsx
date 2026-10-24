/**
 * The rule-break card.
 *
 * A break is written once, by the engine, and shown in both places it matters: as a
 * badge on the leg it belongs to and as a card here. The law/company split in the
 * closing sentence is derived from the breaks themselves, so it changes with the run
 * instead of being copy that can go stale.
 */
import { useRef, useState, type MouseEvent } from 'react'
import type { RosterRuleBreak } from '../types/types'

/** `ChevronRightIcon` lives in the shared UI file; this one keeps the card self-contained. */
function ChevronRightIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={className} aria-hidden="true">
      <path d="m9 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/**
 * The title as the design shows it: the rule, plus `· law rule` for the ones that must be
 * swapped. The backend appends the flight number, but the detail line already names the flight.
 */
function displayTitle(ruleBreak: RosterRuleBreak): string {
  const rule = ruleBreak.title.replace(` · ${ruleBreak.flightNumber}`, '')
  return ruleBreak.severity === 'law' ? `${rule} · law rule` : rule
}

/** `A`, `A and B` — the joining the closing sentence needs. */
function joinCodes(codes: readonly string[]): string {
  if (codes.length <= 1) return codes[0] ?? ''
  return `${codes.slice(0, -1).join(', ')} and ${codes.at(-1)}`
}

/**
 * Tooltip pinned to the cursor rather than laid out in the flow.
 *
 * It is `fixed` at viewport coordinates, which is what keeps it next to the pointer
 * instead of pushing the card around while the mouse moves over it.
 */
function CursorTooltip({ label, x, y }: { label: string; x: number; y: number }) {
  return (
    <span
      role="tooltip"
      style={{ left: x + 14, top: y + 16 }}
      className="pointer-events-none fixed z-50 rounded-md bg-primary px-2.5 py-1.5 text-[12px] font-medium whitespace-nowrap text-white shadow-lg"
    >
      {label}
    </span>
  )
}

const SWAP_HINT = 'Open in Fix & publish to swap crew'
const OVERRIDE_HINT = 'Override in Fix & publish with a written reason'

/**
 * One break. Owns its own tooltip position so two breaks can never fight over it, and
 * so the tooltip state does not live in the card above.
 *
 * The tooltip is armed on the whole row, not on the chevron: a hint that vanishes the
 * moment the pointer drifts off a 16 px button is worse than no hint at all. The
 * chevron stays the only thing that navigates.
 */
function BreakRow({ ruleBreak, onOpenFix }: { ruleBreak: RosterRuleBreak; onOpenFix: () => void }) {
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null)
  const button = useRef<HTMLButtonElement>(null)
  // Every break is fixed in Fix & publish, but not the same way: a law break only
  // clears with a swap, a company one can be overridden in writing.
  const hint = ruleBreak.severity === 'law' ? SWAP_HINT : OVERRIDE_HINT

  /** Keyboard users have no cursor, so the tooltip anchors to the button instead. */
  const showAboveButton = () => {
    const box = button.current?.getBoundingClientRect()
    if (box) setTip({ x: box.right, y: box.top })
  }

  const track = (event: MouseEvent<HTMLElement>) => setTip({ x: event.clientX, y: event.clientY })

  return (
    <li
      onMouseEnter={track}
      onMouseMove={track}
      onMouseLeave={() => setTip(null)}
      className="rounded-xl border border-invalid/25 bg-invalid/5 px-4 py-3 transition-colors hover:bg-invalid/10"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-bold text-invalid">{displayTitle(ruleBreak)}</p>
        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded bg-invalid/10 px-2 py-0.5 text-[10px] font-bold text-invalid">{ruleBreak.code}</span>
          <button
            ref={button}
            type="button"
            onClick={onOpenFix}
            onFocus={showAboveButton}
            onBlur={() => setTip(null)}
            aria-label={`Open ${ruleBreak.code} in Fix & publish`}
            className="rounded p-0.5 text-invalid transition-colors hover:bg-invalid/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-invalid"
          >
            <ChevronRightIcon className="h-4 w-4" />
          </button>
          {tip && <CursorTooltip label={hint} x={tip.x} y={tip.y} />}
        </div>
      </div>
      <p className="mt-1 text-sm leading-relaxed text-primary-text/75">{ruleBreak.detail}</p>
    </li>
  )
}

export function RuleBreaksCard({ breaks, onOpenFix }: { breaks: readonly RosterRuleBreak[]; onOpenFix: () => void }) {
  const lawCodes = [...new Set(breaks.filter((ruleBreak) => ruleBreak.severity === 'law').map((ruleBreak) => ruleBreak.code))]
  const companyCodes = [...new Set(breaks.filter((ruleBreak) => ruleBreak.severity === 'company').map((ruleBreak) => ruleBreak.code))]

  return (
    <section className="rounded-2xl border border-border-desc/40 bg-card-bg p-5 lg:p-7">
      <h2 className="text-lg font-bold text-primary-text lg:text-xl">Rule breaks ({breaks.length})</h2>

      <ul className="mt-4 flex flex-col gap-3">
        {breaks.map((ruleBreak) => (
          <BreakRow key={ruleBreak.id} ruleBreak={ruleBreak} onOpenFix={onOpenFix} />
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

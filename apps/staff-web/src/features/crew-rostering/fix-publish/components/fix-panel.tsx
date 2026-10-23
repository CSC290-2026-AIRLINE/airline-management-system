/**
 * The panel that fixes the selected break.
 *
 * It reads top to bottom as an argument: what the break is, why the roster is not
 * legal, the numbers behind that claim, then what to do about it. Every sentence comes
 * from `break-descriptions` rather than being written here, so the panel and the list
 * on the left cannot describe the same break two different ways.
 */
import type { ReactNode } from 'react'
import { Button, CheckIcon, EmptyFaceIcon, InfoBox } from '../../build-pairings/components/ui'
import { ReplacementPicker } from './replacement-picker'
import type { FixBreak, RosterFact } from '../types/types'

interface FixPanelProps {
  item: FixBreak | null
  /** Company-rule breaks only. Law rules have no override, so the button is absent. */
  onOverride: (item: FixBreak) => void
  onSwap: (breakId: string, candidateId: string) => void
}

export function FixPanel({ item, onOverride, onSwap }: FixPanelProps) {
  if (!item) {
    return (
      <section className="flex flex-col items-center justify-center rounded-2xl border border-border-desc/40 bg-card-bg px-6 py-16 text-center">
        <EmptyFaceIcon className="text-border-desc" />
        <p className="mt-4 text-sm font-bold text-primary-text">Nothing selected</p>
        <p className="mt-1 max-w-xs text-sm leading-relaxed text-primary-text/60">
          Pick a break on the left to see why it is open and who can take the seat.
        </p>
      </section>
    )
  }

  const closed = item.resolution !== undefined

  return (
    <section aria-label={`Fix ${item.code}`} className="rounded-2xl border border-border-desc/40 bg-card-bg p-5 sm:p-6 xl:p-7">
      <p className="text-[11px] font-bold tracking-widest text-primary/45 uppercase">Fixing</p>
      <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-primary-text sm:text-3xl">{item.title}</h2>
      <p className="mt-1 text-sm break-words text-primary-text/60">{item.context}</p>

      {closed && item.resolution ? (
        // The tick and the green text, unlike the red box below: this one reports good
        // news, and a sentence about a break being fixed has nothing to apologise for.
        // Green type over a green tint is one statement, not two — the red box keeps ink
        // for exactly that reason.
        <div className="mt-5 rounded-xl border border-valid/25 bg-valid/10 p-4">
          <p className="flex items-start gap-2 text-sm leading-relaxed font-semibold text-valid">
            <CheckIcon className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{item.resolution.banner}</span>
          </p>
          {item.resolution.reason && (
            <p className="mt-2 border-t border-valid/25 pt-2 text-sm text-primary-text/70">Reason on file: “{item.resolution.reason}”</p>
          )}
        </div>
      ) : (
        // No icon: this box is the rule explaining itself, and an alert glyph next to
        // a sentence that already names the code says the same thing twice. The text
        // stays ink rather than red — the tint is the alarm, and red type on top of it
        // would read as two of them.
        <div className="mt-5 rounded-xl border border-invalid/25 bg-invalid/10 p-4">
          <p className="text-sm leading-relaxed text-primary-text/80">{item.explanation}</p>
        </div>
      )}

      <SectionLabel>What the roster has now</SectionLabel>
      {/* Stacked rather than side by side: on a phone two columns give each label
          about half a word. */}
      <dl className="mt-3 flex flex-col gap-2.5 sm:hidden">
        {item.facts.map((fact) => (
          <FactCard key={fact.label} fact={fact} />
        ))}
      </dl>

      <table className="mt-3 hidden w-full border-collapse text-left sm:table">
        <caption className="sr-only">Roster facts behind this break</caption>
        <tbody>
          {item.facts.map((fact) => (
            <FactRow key={fact.label} fact={fact} />
          ))}
        </tbody>
      </table>

      {!closed && item.replacement && (
        <div className="mt-6">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <SectionLabel>Replace with</SectionLabel>
            <span className="text-sm text-primary-text/60">{item.replacement.availableLabel}</span>
          </div>
          {/* With nobody to offer, the picker prints its own blocked note; a second
              sentence asking for a swap that cannot happen would only argue with it. */}
          {item.replacement.candidates.length > 0 && (
            <p className="mt-2 text-sm leading-relaxed text-primary-text/70">{item.replacement.instruction}</p>
          )}
          <ReplacementPicker item={item} onSwap={(candidateId) => onSwap(item.id, candidateId)} />
        </div>
      )}

      {!closed && item.severity === 'company' && (
        <div className="mt-6 border-t border-border-desc/30 pt-5">
          <InfoBox>This is a company rule, so it can be closed in writing. A reason is required and goes to the audit log.</InfoBox>
          <Button variant="outline" className="mt-4" onClick={() => onOverride(item)}>
            Override with a reason
          </Button>
        </div>
      )}

      {!closed && item.severity === 'law' && (
        <p className="mt-6 border-t border-border-desc/30 pt-5 text-xs leading-relaxed text-primary-text/60">
          This is a law rule, so it can only be closed by flying someone who clears it. There is no override.
        </p>
      )}
    </section>
  )
}

/**
 * The small-caps section headings the mockups put above each block.
 *
 * Cooler and bluer than the grey used for facts, and underlined: these are the two
 * headings that divide the panel into "what is wrong" and "what to do", and the rule is
 * what makes the division visible without a box around either half.
 */
function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="border-b border-border-desc/25 pb-2 text-[11px] font-bold tracking-widest text-primary/45 uppercase">{children}</p>
}

function FactRow({ fact }: { fact: RosterFact }) {
  return (
    <tr className="border-b border-border-desc/25 last:border-b-0">
      <th scope="row" className="w-1/2 py-4 pr-4 align-top text-sm font-normal text-primary-text/60">
        {fact.label}
      </th>
      <td className={`py-4 text-sm font-semibold ${fact.danger ? 'text-invalid' : 'text-primary-text'}`}>{fact.value}</td>
    </tr>
  )
}

/** The same facts as the table, for phones, where a two-column table cannot hold a label. */
function FactCard({ fact }: { fact: RosterFact }) {
  return (
    <div className="border-b border-border-desc/25 pb-3 last:border-b-0 last:pb-0">
      <dt className="text-[11px] font-semibold tracking-widest text-primary-text/60 uppercase">{fact.label}</dt>
      <dd className={`mt-0.5 text-sm font-semibold ${fact.danger ? 'text-invalid' : 'text-primary-text'}`}>{fact.value}</dd>
    </div>
  )
}

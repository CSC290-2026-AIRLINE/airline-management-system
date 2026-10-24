/**
 * The numbered break list down the left of the workspace, and the rules that decide
 * who may fill each seat.
 *
 * This is the page's index, so the numbers are fixed when an item first appears and do
 * not renumber as others close — an operator who says "break 3" is still talking about
 * the same thing after fixing break 1. Closed items stay in the list with what closed
 * them, because "where did this go" is the question a break list has to answer alone.
 */
import { listLabel } from '../types/labels'
import type { FixBreak } from '../types/types'

interface BreakListProps {
  breaks: readonly FixBreak[]
  selectedId: string | null
  onSelect: (id: string) => void
  /** `Rule breaks` while drafting, `Open seats` once the roster is live. */
  title: string
  subtitle?: string
}

/**
 * Who can legally fill which seat.
 *
 * Printed under the list because it is the rule the picker silently applies. An
 * operator who cannot see why a cabin crew member is not offered a police seat will
 * assume the picker is broken.
 */
const SEAT_RULES: readonly { label: string; rule: string }[] = [
  { label: 'Captain', rule: 'by captain role' },
  { label: 'First officer', rule: 'by first officer role' },
  { label: 'Cabin crew', rule: 'by cabin crew, Feature 9 count' },
  { label: 'Local crew', rule: 'by same language (KR, JP, TH)' },
  { label: 'Police', rule: 'by police, 2 on international legs' },
]

/**
 * The border each row wears, and the tint behind it.
 *
 * Open rows are tinted as well as outlined, because an open row is the one asking for
 * something; a closed row is history and needs no colour beyond its green or amber
 * border. Selection wins over state — the operator needs to know which row the panel is
 * about before they need to know whether it is open.
 */
function rowStyle(item: FixBreak, selected: boolean): string {
  const border = selected
    ? 'border-primary-text'
    : item.resolution?.kind === 'overridden'
      ? 'border-secondary/60'
      : item.resolution
        ? 'border-valid/40'
        : 'border-invalid/25'
  // Green carries more alpha than red for the same apparent tint: it is far lighter in
  // luminance, so at the same percentage it would disappear against the white card.
  return `${border} ${item.resolution === undefined ? 'bg-invalid/5' : 'bg-valid/8'}`
}

export function BreakList({ breaks, selectedId, onSelect, title, subtitle }: BreakListProps) {
  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-2xl border border-border-desc/40 bg-card-bg px-5 py-5">
        <h2 className="text-xl font-bold text-primary-text">{title}</h2>
        {subtitle && <p className="mt-1 text-sm leading-relaxed text-primary-text/60">{subtitle}</p>}

        {breaks.length === 0 ? (
          <p className="mt-4 text-sm leading-relaxed text-primary-text/60">
            Nothing is open. Every seat on this roster has someone legal in it.
          </p>
        ) : (
          <ol className="mt-4 flex flex-col gap-4">
            {breaks.map((item) => {
              const closed = item.resolution !== undefined
              const overridden = item.resolution?.kind === 'overridden'
              const selected = item.id === selectedId
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(item.id)}
                    aria-current={selected ? 'true' : undefined}
                    // `brightness` rather than `hover:bg-*`: a background on hover would
                    // wipe the open/closed tint the row is already carrying.
                    className={`flex w-full flex-col gap-1.5 rounded-lg border-2 px-4 py-3 text-left transition-[filter] hover:brightness-[0.98] ${rowStyle(
                      item,
                      selected,
                    )}`}
                  >
                    <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                      {/* No tick glyph: the verb already says what happened, and a row
                          that reads `Fixed · REST_SHORT` needs no second marker saying
                          the same thing in a different language. */}
                      <span className={`text-sm font-bold ${closed ? 'text-valid' : 'text-invalid'}`}>
                        {closed ? `${overridden ? 'Overridden' : 'Fixed'} · ${listLabel(item)}` : `${item.position} · ${listLabel(item)}`}
                      </span>
                      <StatePill closed={closed} overridden={overridden} />
                    </span>

                    {/* The list quotes the same sentence the panel does, so the operator
                        can scan here and know exactly what the panel will say. */}
                    <span className={`text-[13px] leading-relaxed break-words ${closed ? 'text-valid/80' : 'text-primary-text/70'}`}>
                      {closed ? item.resolution?.summary : item.shortDetail}
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>
        )}
      </section>

      <section className="rounded-2xl border border-border-desc/40 bg-card-bg px-5 py-5">
        <h2 className="text-xl font-bold text-primary-text">Eligible replacement rules</h2>
        <p className="mt-1 text-sm leading-relaxed text-primary-text/60">
          Roles are never mixed. Only police can fill a police seat, and local crew must speak the destination language.
        </p>
        <dl className="mt-4 flex flex-col gap-4">
          {SEAT_RULES.map((seat) => (
            <div key={seat.label} className="flex items-baseline justify-between gap-3">
              <dt className="text-sm font-semibold text-primary-text">{seat.label}</dt>
              <dd className="text-sm text-primary-text/60">{seat.rule}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  )
}

/** `[Open]` / `[Fixed]` / `[Overridden]` — how the item is closed, or that it is not. */
function StatePill({ closed, overridden }: { closed: boolean; overridden: boolean }) {
  // Overridden is green, not amber: an override still leaves the roster legal, and the
  // only thing that should read as a warning on this list is a break that is still open.
  const style = closed ? 'border-valid/40 text-valid' : 'border-invalid/40 text-invalid'
  const label = overridden ? 'Overridden' : closed ? 'Fixed' : 'Open'
  return <span className={`rounded-full border bg-white px-2.5 py-0.5 text-[11px] font-semibold ${style}`}>{label}</span>
}

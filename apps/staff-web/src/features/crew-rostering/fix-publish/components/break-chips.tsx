/**
 * The phone's stand-in for the break list: one chip per item, the selected one in navy.
 *
 * A numbered list with a sentence under each item needs a column of its own, and a phone has
 * none to spare. The chips keep what a list has to say — which items exist and which are done —
 * and the panel underneath carries the sentence.
 */
import { CheckIcon } from '../../shared/ui'
import { listLabel } from '../types/labels'
import type { FixBreak } from '../types/types'

export function BreakChips({
  breaks,
  selectedId,
  isPublished,
  onSelect,
}: {
  breaks: readonly FixBreak[]
  selectedId: string | null
  isPublished: boolean
  onSelect: (id: string) => void
}) {
  if (breaks.length === 0) return null
  const label = isPublished ? (breaks.length === 1 ? 'Open seat' : 'Open seats') : breaks.length === 1 ? 'Rule break' : 'Breaks'

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="mr-0.5 text-sm text-primary-text/60">{label}</span>
      {breaks.map((item) => {
        const closed = item.resolution !== undefined
        const overridden = item.resolution?.kind === 'overridden'
        const selected = item.id === selectedId
        // A live roster's seats are told apart by flight, since the same code can be open on two legs.
        const text = isPublished && !closed ? `${listLabel(item)}${item.removed ? '' : ` · ${item.flightNumber}`}` : listLabel(item)
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            aria-pressed={selected}
            className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
              selected
                ? 'border-btn-navy bg-btn-navy text-white'
                : closed
                  ? 'border-green-line bg-green-tint text-valid'
                  : 'border-border-desc bg-white text-primary-text/70'
            }`}
          >
            {closed && !overridden && <CheckIcon className="h-3 w-3" />}
            {closed && overridden ? `Overridden · ${text}` : text}
          </button>
        )
      })}
    </div>
  )
}

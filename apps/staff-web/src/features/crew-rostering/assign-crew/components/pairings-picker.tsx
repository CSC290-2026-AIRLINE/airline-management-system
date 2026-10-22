/**
 * The committed-pairings picker.
 *
 * This is the control that decides what gets crewed, so it is the one card that is
 * rendered twice: a table on desktop and a stack of cards on mobile. Both trees read
 * the same selection and call the same handlers; only the presentation differs.
 */
import { formatDateRange, formatRoute, localDateKey, pluralise } from '../../build-pairings/types/format'
import { Button, StatusBadge } from '../../build-pairings/components/ui'
import type { CommittedPairing, ExcludedPairing } from '../types/types'

export interface PairingsPickerProps {
  pairings: readonly CommittedPairing[]
  selectedIds: readonly string[]
  excluded: readonly ExcludedPairing[]
  canRun: boolean
  onToggle: (id: string) => void
  onSelectAll: () => void
  onClearSelection: () => void
  onRun: () => void
}

/** `1 night ICN`, when a pairing rests overnight somewhere between its legs. */
function overnightAt(pairing: CommittedPairing): string | null {
  for (let index = 0; index < pairing.legs.length - 1; index += 1) {
    const leg = pairing.legs[index]
    const next = pairing.legs[index + 1]
    if (!leg || !next) continue
    const rests = localDateKey(leg.arrivalAt) < localDateKey(next.departureAt)
    if (rests && leg.destination === next.origin) {
      return `${pluralise(daysBetween(localDateKey(leg.arrivalAt), localDateKey(next.departureAt)), 'night')} ${leg.destination}`
    }
  }
  return null
}

function daysBetween(from: string, to: string): number {
  return Math.round((new Date(`${to}T00:00:00.000Z`).getTime() - new Date(`${from}T00:00:00.000Z`).getTime()) / 86_400_000)
}

function routeOf(pairing: CommittedPairing): string {
  return formatRoute([...pairing.legs.map((leg) => leg.origin), ...(pairing.legs.at(-1) ? [pairing.legs.at(-1)!.destination] : [])])
}

function dateOf(pairing: CommittedPairing): string {
  const first = pairing.legs[0]
  const last = pairing.legs.at(-1)
  if (!first || !last) return '—'
  return formatDateRange(localDateKey(first.departureAt), localDateKey(last.arrivalAt))
}

/**
 * The sentence under the picker. It is assembled from what Build pairings refused to
 * hand over, so an operator can tell a filtered pairing from a missing one.
 */
export function ExclusionFootnote({ excluded }: { excluded: readonly ExcludedPairing[] }) {
  const deleted = excluded.filter((pairing) => pairing.reason === 'deleted')
  const invalid = excluded.filter((pairing) => pairing.reason === 'invalid')
  if (excluded.length === 0) return null

  const sentences: string[] = []
  if (deleted.length > 0) {
    sentences.push(
      `${deleted.map((pairing) => pairing.id).join(' and ')} ${deleted.length === 1 ? 'was' : 'were'} deleted in Build pairings.`,
    )
  }
  if (invalid.length > 0) {
    sentences.push(
      `${invalid.map((pairing) => pairing.id).join(' and ')} ${invalid.length === 1 ? 'was' : 'were'} left out because ${invalid.length === 1 ? 'it is' : 'they are'} invalid.`,
    )
  }
  if (deleted.length === 0) sentences.unshift('Only valid pairings from Build pairings are used.')

  return <p className="text-[13px] leading-relaxed text-primary-text/55">{sentences.join(' ')}</p>
}

export function PairingsPicker({
  pairings,
  selectedIds,
  excluded,
  canRun,
  onToggle,
  onSelectAll,
  onClearSelection,
  onRun,
}: PairingsPickerProps) {
  const selectedCount = selectedIds.length
  const flightCount = pairings
    .filter((pairing) => selectedIds.includes(pairing.id))
    .reduce((total, pairing) => total + pairing.legs.length, 0)

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-[13px] font-bold tracking-wide text-primary-text uppercase">Committed pairings · valid only</h3>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onSelectAll}>
            Select all
          </Button>
          <Button variant="outline" onClick={onClearSelection}>
            Clear selection
          </Button>
        </div>
      </div>

      <PairingTable pairings={pairings} selectedIds={selectedIds} onToggle={onToggle} />
      <PairingCards pairings={pairings} selectedIds={selectedIds} onToggle={onToggle} />

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold text-primary-text">
          {selectedCount} of {pairings.length} {pairings.length === 1 ? 'pairing' : 'pairings'} selected
          {selectedCount > 0 && <span className="font-normal text-primary-text/70"> · {pluralise(flightCount, 'flight')}</span>}
        </p>
        <Button onClick={onRun} disabled={!canRun}>
          Run auto-assign
        </Button>
      </div>

      {selectedCount === 0 && (
        <p role="alert" className="mt-4 rounded-lg border border-invalid/30 bg-invalid-bg px-4 py-3 text-sm font-medium text-invalid">
          <span className="font-bold">NO_PAIRINGS</span> · Select at least one pairing to run auto-assign.
        </p>
      )}

      <div className="mt-4">
        <ExclusionFootnote excluded={excluded} />
      </div>
    </div>
  )
}

/** Desktop: one row per pairing, with the checkbox in the first column. */
function PairingTable({ pairings, selectedIds, onToggle }: Pick<PairingsPickerProps, 'pairings' | 'selectedIds' | 'onToggle'>) {
  if (pairings.length === 0) return null
  return (
    <div className="mt-4 hidden overflow-hidden rounded-xl border border-border-desc/40 lg:block">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-page-bg">
          <tr className="text-left text-[13px] font-semibold text-primary-text/70">
            <th className="w-12 px-4 py-3">
              <span className="sr-only">Select</span>
            </th>
            <th className="px-4 py-3">Pairing</th>
            <th className="px-4 py-3">Date</th>
            <th className="px-4 py-3">Route</th>
            <th className="px-4 py-3">Flights</th>
            <th className="px-4 py-3">Status</th>
          </tr>
        </thead>
        <tbody>
          {pairings.map((pairing) => (
            <tr key={pairing.id} className="border-t border-border-desc/30">
              <td className="px-4 py-3.5">
                <Checkbox checked={selectedIds.includes(pairing.id)} onChange={() => onToggle(pairing.id)} label={`Select ${pairing.id}`} />
              </td>
              <td className="px-4 py-3.5 font-semibold text-primary-text">{pairing.id}</td>
              <td className="px-4 py-3.5 text-primary-text/80">{dateOf(pairing)}</td>
              <td className="px-4 py-3.5 text-primary-text/80">{routeOf(pairing)}</td>
              <td className="px-4 py-3.5 text-primary-text/80">{capitalise(pluralise(pairing.legs.length, 'flight'))}</td>
              <td className="px-4 py-3.5">
                <StatusBadge status="passed" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Mobile: the same pairings as tappable cards, since a nine-column table will not fit. */
export function PairingCards({ pairings, selectedIds, onToggle }: Pick<PairingsPickerProps, 'pairings' | 'selectedIds' | 'onToggle'>) {
  if (pairings.length === 0) return null
  return (
    <ul className="mt-4 flex flex-col gap-2.5 lg:hidden">
      {pairings.map((pairing) => {
        const overnight = overnightAt(pairing)
        return (
          <li key={pairing.id}>
            <button
              type="button"
              onClick={() => onToggle(pairing.id)}
              aria-pressed={selectedIds.includes(pairing.id)}
              className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
                selectedIds.includes(pairing.id) ? 'border-primary/40 bg-page-bg' : 'border-border-desc/40 bg-card-bg'
              }`}
            >
              <Checkbox checked={selectedIds.includes(pairing.id)} onChange={() => onToggle(pairing.id)} label={`Select ${pairing.id}`} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-primary-text">
                  {pairing.id} · {routeOf(pairing)}
                </span>
                <span className="mt-0.5 block truncate text-[13px] text-primary-text/60">
                  {dateOf(pairing)} · {pluralise(pairing.legs.length, 'flight')}
                  {overnight && ` · ${overnight}`}
                </span>
              </span>
              <StatusBadge status="passed" />
            </button>
          </li>
        )
      })}
    </ul>
  )
}

export function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <label className="inline-flex items-center">
      <input type="checkbox" checked={checked} onChange={onChange} className="peer sr-only" />
      <span
        aria-hidden="true"
        className={`flex h-[18px] w-[18px] items-center justify-center rounded-[5px] border transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary ${
          checked ? 'border-primary bg-primary text-white' : 'border-border-desc bg-white'
        }`}
      >
        {checked && (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" className="h-3 w-3">
            <path d="m5 13 4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <span className="sr-only">{label}</span>
    </label>
  )
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

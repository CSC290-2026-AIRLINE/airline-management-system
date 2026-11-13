/**
 * The committed-pairings picker.
 *
 * This is the control that decides what gets crewed, so it is the one card that is
 * rendered twice: a table on desktop and a stack of cards on mobile. Both trees read
 * the same selection and call the same handlers; only the presentation differs.
 */
import { formatDateRange, localDateKey, pluralise } from '../../build-pairings/types/format'
import { RouteText } from '../../build-pairings/components/route-text'
import { Button, StatusBadge } from '../../shared/ui'
import type { RosterPairing, UncommittedPairing } from '../types/types'

export interface PairingsPickerProps {
  pairings: readonly RosterPairing[]
  selectedIds: readonly string[]
  excluded: readonly UncommittedPairing[]
  canRun: boolean
  /** False when the run button lives elsewhere, as it does on a phone once a run has results. */
  showRun?: boolean
  /** True once the run has crew: the button then reads `Re-run auto-assign`. */
  hasRun?: boolean
  onToggle: (id: string) => void
  onSelectAll: () => void
  onClearSelection: () => void
  onRun: () => void
}

/** `1 night ICN`, when a pairing rests overnight somewhere between its legs. */
function overnightAt(pairing: RosterPairing): string | null {
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

function routeOf(pairing: RosterPairing): string[] {
  const last = pairing.legs.at(-1)
  return [...pairing.legs.map((leg) => leg.origin), ...(last ? [last.destination] : [])]
}

function dateOf(pairing: RosterPairing): string {
  const first = pairing.legs[0]
  const last = pairing.legs.at(-1)
  if (!first || !last) return '—'
  return formatDateRange(localDateKey(first.departureAt), localDateKey(last.arrivalAt))
}

/** `P-103 and P-104 were left out because they're invalid or not committed.`, or nothing when none were. */
export function ExclusionFootnote({ excluded, withLead = true }: { excluded: readonly UncommittedPairing[]; withLead?: boolean }) {
  if (excluded.length === 0) return null
  const codes = excluded.map((pairing) => pairing.code)
  const list = codes.length <= 1 ? codes.join('') : `${codes.slice(0, -1).join(', ')} and ${codes.at(-1)}`
  return (
    <p className="text-xs leading-relaxed text-primary-text/55 lg:text-[13px]">
      {withLead && <span className="hidden lg:inline">Only valid pairings from Build pairings are used. </span>}
      {list} {codes.length === 1 ? 'was' : 'were'} left out because {codes.length === 1 ? "it's" : "they're"} invalid or not committed.
    </p>
  )
}

function NoPairingsAlert() {
  return (
    <p role="alert" className="rounded-lg border border-invalid/30 bg-invalid/5 px-4 py-2.5 text-sm text-invalid">
      NO_PAIRINGS · Select at least one pairing to run auto-assign.
    </p>
  )
}

/** The Run button turns flat grey when there is nothing to run, as the design shows. */
const RUN_BUTTON = 'h-11 px-6 disabled:bg-border-desc disabled:opacity-100'

export function PairingsPicker({
  pairings,
  selectedIds,
  excluded,
  canRun,
  showRun = true,
  hasRun = false,
  onToggle,
  onSelectAll,
  onClearSelection,
  onRun,
}: PairingsPickerProps) {
  const selectedCount = selectedIds.length
  const flightCount = pairings
    .filter((pairing) => selectedIds.includes(pairing.id))
    .reduce((total, pairing) => total + pairing.legs.length, 0)
  const summary = (
    <>
      {selectedCount} of {pairings.length} {pairings.length === 1 ? 'pairing' : 'pairings'} selected
      {selectedCount > 0 && ` · ${pluralise(flightCount, 'flight')}`}
    </>
  )

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-bold text-primary-text lg:text-xs lg:font-extrabold lg:tracking-wider lg:uppercase">
          Committed pairings<span className="hidden lg:inline"> · valid only</span>
        </h3>
        <div className="flex gap-2 max-lg:order-last max-lg:w-full">
          <Button variant="outline" className="h-8 px-3 text-xs font-semibold lg:h-9 lg:text-[13px]" onClick={onSelectAll}>
            Select all
          </Button>
          <Button variant="outline" className="h-8 px-3 text-xs font-semibold lg:h-9 lg:text-[13px]" onClick={onClearSelection}>
            Clear selection
          </Button>
        </div>
      </div>

      {pairings.length === 0 && (
        <p className="mt-4 rounded-lg border border-border-desc/40 bg-page-bg px-4 py-3 text-sm text-primary-text/70">
          Nothing is committed for this base and window yet. Commit valid pairings in Build pairings first.
        </p>
      )}
      <PairingTable pairings={pairings} selectedIds={selectedIds} onToggle={onToggle} />
      <PairingCards pairings={pairings} selectedIds={selectedIds} onToggle={onToggle} />

      {/* Desktop: the count and the run button share a row; the alert and footnote follow. */}
      <div className="hidden lg:block">
        <div className="mt-6 flex items-center justify-between gap-3">
          <p className="text-[15px] font-bold text-primary-text">{summary}</p>
          {showRun && (
            <Button className={RUN_BUTTON} onClick={onRun} disabled={!canRun}>
              {hasRun ? 'Re-run auto-assign' : 'Run auto-assign'}
            </Button>
          )}
        </div>
        {selectedCount === 0 && (
          <div className="mt-3">
            <NoPairingsAlert />
          </div>
        )}
        <div className="mt-4">
          <ExclusionFootnote excluded={excluded} />
        </div>
      </div>

      {/* Phone: count, footnote, alert, then a full-width run button. */}
      <div className="lg:hidden">
        <p className="mt-4 text-sm font-bold text-primary-text">{summary}</p>
        <div className="mt-1.5">
          <ExclusionFootnote excluded={excluded} withLead={false} />
        </div>
        {selectedCount === 0 && (
          <div className="mt-3">
            <NoPairingsAlert />
          </div>
        )}
        {showRun && (
          <Button fullWidth className={`mt-4 ${RUN_BUTTON}`} onClick={onRun} disabled={!canRun}>
            {hasRun ? 'Re-run auto-assign' : 'Run auto-assign'}
          </Button>
        )}
      </div>
    </div>
  )
}

/** Outlined `Valid` pill the picker rows use. */
function ValidPill() {
  return (
    <span className="inline-flex min-w-20 justify-center rounded-full border border-valid px-3 py-0.5 text-xs font-medium text-valid">
      Valid
    </span>
  )
}

/** Desktop: one row per pairing, with the checkbox in the first column. */
function PairingTable({ pairings, selectedIds, onToggle }: Pick<PairingsPickerProps, 'pairings' | 'selectedIds' | 'onToggle'>) {
  if (pairings.length === 0) return null
  return (
    <div className="mt-4 hidden overflow-hidden rounded-xl border border-border-desc/50 lg:block">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-page-bg">
          <tr className="text-left text-[13px] font-bold text-primary-text">
            <th className="w-16 px-5 py-3.5">
              <span className="sr-only">Select</span>
            </th>
            <th className="w-36 px-3 py-3.5">Pairing</th>
            <th className="w-44 px-3 py-3.5">Date</th>
            <th className="px-3 py-3.5">Route</th>
            <th className="w-40 px-3 py-3.5">Flights</th>
            <th className="w-40 px-3 py-3.5 text-center">Status</th>
          </tr>
        </thead>
        <tbody>
          {pairings.map((pairing) => (
            <tr key={pairing.id} className="border-t border-border-desc/40">
              <td className="px-5 py-3.5">
                <Checkbox
                  checked={selectedIds.includes(pairing.id)}
                  onChange={() => onToggle(pairing.id)}
                  label={`Select ${pairing.code}`}
                />
              </td>
              <td className="px-3 py-3.5 font-bold text-primary-text">{pairing.code}</td>
              <td className="px-3 py-3.5 text-primary-text/80">{dateOf(pairing)}</td>
              <td className="px-3 py-3.5 text-primary-text/80">
                <RouteText route={routeOf(pairing)} arrowSize="h-3 w-3" arrowClassName="text-primary-text/80" />
              </td>
              <td className="px-3 py-3.5 text-primary-text/80">{capitalise(pluralise(pairing.legs.length, 'flight'))}</td>
              <td className="px-3 py-3.5 text-center">
                <ValidPill />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Mobile: the same pairings as tappable cards, since a six-column table will not fit. */
export function PairingCards({ pairings, selectedIds, onToggle }: Pick<PairingsPickerProps, 'pairings' | 'selectedIds' | 'onToggle'>) {
  if (pairings.length === 0) return null
  return (
    <ul className="mt-3 flex flex-col gap-2.5 lg:hidden">
      {pairings.map((pairing) => {
        const overnight = overnightAt(pairing)
        const selected = selectedIds.includes(pairing.id)
        return (
          <li key={pairing.id}>
            <div
              role="button"
              tabIndex={0}
              onClick={() => onToggle(pairing.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onToggle(pairing.id)
                }
              }}
              aria-pressed={selected}
              className={`flex w-full cursor-pointer items-center gap-3 rounded-xl border bg-card-bg px-3.5 py-3 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                selected ? 'border-primary/50' : 'border-border-desc/50'
              }`}
            >
              <Checkbox checked={selected} onChange={() => onToggle(pairing.id)} label={`Select ${pairing.code}`} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-primary-text">
                  {pairing.code} · <RouteText route={routeOf(pairing)} arrowSize="h-3.5 w-3.5" arrowClassName="text-primary-text" />
                </span>
                <span className="mt-0.5 block text-xs text-primary-text/60">
                  {dateOf(pairing)} · {pluralise(pairing.legs.length, 'flight')}
                  {overnight && ` · ${overnight}`}
                </span>
              </span>
              <StatusBadge status="passed" />
            </div>
          </li>
        )
      })}
    </ul>
  )
}

export function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <label className="inline-flex items-center" onClick={(event) => event.stopPropagation()}>
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

import { useMemo, useState } from 'react'
import { formatDay, formatTime } from '../types/format'
import { validatePairing } from '../types/pairing-engine'
import type { FlightLeg, Pairing } from '../types/types'
import { ArrowDownIcon, ArrowUpIcon, BaseModalOverlay, Button, GripIcon, MinusIcon, PlusIcon } from '../../shared/ui'
import { AddLegModal } from './add-leg-modal'
import { RemoveLegModal } from './remove-leg-modal'

/**
 * Reorder, add and remove a pairing's legs.
 *
 * Edits are held in local state and only committed on "Save & re-check", which
 * is what triggers the full FTL re-validation in the page behind this modal.
 * Cancel discards them.
 */
export function EditLegsModal({
  pairing,
  allFlights,
  onCancel,
  onSave,
}: {
  pairing: Pairing
  allFlights: import('../types/types').ScheduledFlight[]
  onCancel: () => void
  onSave: (legs: FlightLeg[]) => void
}) {
  const [legs, setLegs] = useState<FlightLeg[]>(pairing.legs)
  const [adding, setAdding] = useState(false)
  const [removingIndex, setRemovingIndex] = useState<number | null>(null)

  const wasValid = useMemo(() => validatePairing(pairing).status === 'passed', [pairing])
  const preview = useMemo(() => validatePairing({ ...pairing, legs }), [pairing, legs])
  const dirty = legs.map((leg) => leg.flightId).join() !== pairing.legs.map((leg) => leg.flightId).join()

  const route = legs.length === 0 ? [] : [legs[0].origin, ...legs.map((leg) => leg.destination)]

  function move(index: number, delta: -1 | 1) {
    const target = index + delta
    if (target < 0 || target >= legs.length) return
    setLegs((current) => {
      const next = [...current]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  return (
    <>
      <BaseModalOverlay
        title="Edit legs"
        variant="plain"
        mobileSheet
        width="max-w-xl"
        titleAside={
          legs.some((leg) => leg.addedManually) ? undefined : (
            <span className="hidden rounded-full bg-info-bg px-3 py-1 text-[11px] font-bold text-blue-700 sm:inline">Auto-built</span>
          )
        }
        onClose={onCancel}
        footer={
          <>
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => onSave(legs)}>
              Save &amp; re-check
            </Button>
          </>
        }
      >
        <p className="hidden text-sm text-primary-text/60 sm:block">
          Changes are immediately rechecked for return-to-base, duty, flight and day limits.
        </p>
        <p className="text-sm font-bold text-primary-text sm:mt-1.5">
          {pairing.code} · <span className="sm:hidden">{route.join(' → ')}</span>
          <span className="hidden sm:inline">{route.join(' → ')}</span>
        </p>

        {wasValid && (
          <p className="mt-3 rounded-lg border border-amber-line bg-amber-tint px-3.5 py-2.5 text-sm font-semibold text-amber-ink">
            {pairing.code} is Valid now. Adding or removing a flight re-checks every rule and can make it Invalid, for example if it no
            longer ends at {pairing.base} or goes over the duty limits.
          </p>
        )}

        <ol className="mt-3 flex flex-col gap-3 sm:gap-0 sm:border-t sm:border-border-desc/50">
          {legs.map((leg, index) => (
            <li
              key={leg.flightId}
              className="flex items-center gap-3 rounded-xl border border-border-desc/50 px-3 py-3 sm:rounded-none sm:border-0 sm:border-b sm:px-0 sm:py-3.5"
            >
              <GripIcon className="hidden h-3.5 w-3.5 shrink-0 text-border-desc sm:block" />
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-page-bg text-xs font-bold text-primary-text/60 sm:h-auto sm:w-4 sm:bg-transparent sm:text-sm">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <span className="text-sm font-extrabold text-primary-text">
                    {leg.flightNumber}
                    <span className="sm:hidden"> ·</span>
                  </span>
                  <span className="text-sm font-extrabold text-primary-text">
                    {leg.origin} → {leg.destination}
                  </span>
                  {leg.addedManually && (
                    <span className="rounded-full bg-valid-bg px-2 py-0.5 text-[11px] font-bold text-valid">Added</span>
                  )}
                </span>
                <span className="mt-0.5 block text-xs text-primary-text/55">
                  {formatDay(leg.departureAt)} · {formatTime(leg.departureAt)}–{formatTime(leg.arrivalAt)}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5">
                <IconAction label={`Move ${leg.flightNumber} up`} disabled={index === 0} onClick={() => move(index, -1)}>
                  <ArrowUpIcon className="h-3.5 w-3.5" />
                </IconAction>
                <IconAction label={`Move ${leg.flightNumber} down`} disabled={index === legs.length - 1} onClick={() => move(index, 1)}>
                  <ArrowDownIcon className="h-3.5 w-3.5" />
                </IconAction>
                <button
                  type="button"
                  aria-label={`Remove ${leg.flightNumber}`}
                  onClick={() => setRemovingIndex(index)}
                  className="ml-0.5 inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-invalid px-2.5 text-xs font-bold text-white transition-colors hover:bg-btn-red-hover sm:h-9 sm:px-5 sm:text-sm"
                >
                  <MinusIcon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Remove</span>
                </button>
              </span>
            </li>
          ))}
        </ol>

        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mt-4 inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-border-desc/70 bg-white text-sm font-bold text-primary-text transition-colors hover:bg-page-bg sm:h-10 sm:w-auto sm:border-0 sm:bg-btn-navy sm:px-4 sm:text-white sm:hover:bg-btn-navy-hover"
        >
          <PlusIcon className="hidden h-3.5 w-3.5 sm:block" />
          <span className="sm:hidden">+ </span>Add leg
        </button>

        {dirty && (
          <p
            role="status"
            className={`mt-4 rounded-lg border px-3.5 py-2.5 text-sm font-semibold ${
              preview.status === 'passed' ? 'border-green-line bg-green-tint text-valid' : 'border-invalid/30 bg-invalid/5 text-invalid'
            }`}
          >
            {preview.status === 'passed'
              ? `After this change ${pairing.code} is Valid.`
              : `After this change ${pairing.code} is Invalid · ${preview.primaryError?.code} · ${preview.primaryError?.detail}`}
          </p>
        )}

        <p className="mt-4 hidden rounded-lg bg-info-bg px-4 py-4 text-sm font-bold text-blue-700 sm:block">
          Add, remove, or reorder legs. Saving immediately re-checks all pairing rules.
        </p>
        <p className="mt-4 text-sm text-primary-text/55 sm:hidden">Every change is re-checked against the pairing rules when you save.</p>
      </BaseModalOverlay>

      {adding && (
        <AddLegModal
          pairing={{ ...pairing, legs }}
          allFlights={allFlights}
          onCancel={() => setAdding(false)}
          onAdd={(leg) => {
            setLegs((current) => [...current, leg])
            setAdding(false)
          }}
        />
      )}

      {removingIndex !== null && legs[removingIndex] && (
        <RemoveLegModal
          pairing={pairing}
          leg={legs[removingIndex]}
          index={removingIndex}
          totalLegs={legs.length}
          onCancel={() => setRemovingIndex(null)}
          onConfirm={() => {
            setLegs((current) => current.filter((_, index) => index !== removingIndex))
            setRemovingIndex(null)
          }}
        />
      )}
    </>
  )
}

function IconAction({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="rounded-md border border-border-desc/70 bg-white p-1.5 text-primary-text transition-colors hover:bg-page-bg disabled:cursor-not-allowed disabled:opacity-30"
    >
      {children}
    </button>
  )
}

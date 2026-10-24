import { useState } from 'react'
import { formatRoute, formatTime } from '../types/format'
import type { FlightLeg, Pairing } from '../types/types'
import { ArrowDownIcon, ArrowUpIcon, BaseModalOverlay, Button, GripIcon, InfoBox, PlusIcon, TrashIcon } from '../../shared/ui'
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
        title={
          <span className="flex flex-wrap items-center gap-2.5">
            Edit legs
            <span className="rounded-full bg-info-bg px-2.5 py-1 text-[11px] font-semibold text-primary">
              {legs.some((leg) => leg.addedManually) ? 'Edited' : 'Auto-built'}
            </span>
          </span>
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
        <p className="text-sm text-primary-text/60">Changes are immediately rechecked for return-to-base, duty, flight and day limits.</p>
        <p className="mt-2 text-sm font-semibold text-primary-text">
          {pairing.id} · {formatRoute(route)}
        </p>

        <ol className="mt-5 flex flex-col gap-2.5">
          {legs.map((leg, index) => (
            <li
              key={leg.flightId}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border-desc/30 px-4 py-3 sm:flex-nowrap"
            >
              <GripIcon className="h-4 w-4 shrink-0 text-border-desc" />
              <span className="w-4 shrink-0 text-xs font-semibold text-primary-text/40">{index + 1}</span>
              {/* Below `sm` the row is too narrow to hold the flight details and
                  the actions side by side, so the actions wrap onto their own
                  line and the details get the full width. */}
              <span className="flex w-full min-w-0 flex-wrap items-center gap-x-2 gap-y-1 sm:w-auto sm:flex-1">
                <span className="font-semibold text-primary-text">{leg.flightNumber}</span>
                <span className="text-sm whitespace-nowrap text-primary-text/80">
                  {leg.origin} ➔ {leg.destination}
                </span>
                <span className="text-sm whitespace-nowrap text-primary-text/60">
                  {formatTime(leg.departureAt)}–{formatTime(leg.arrivalAt)}
                </span>
                {leg.addedManually && <span className="rounded-full bg-valid-bg px-2 py-0.5 text-[11px] font-bold text-valid">Added</span>}
              </span>
              <span className="flex w-full shrink-0 items-center justify-end gap-1 sm:w-auto sm:justify-start">
                <IconAction label={`Move ${leg.flightNumber} up`} disabled={index === 0} onClick={() => move(index, -1)}>
                  <ArrowUpIcon className="h-3.5 w-3.5" />
                </IconAction>
                <IconAction label={`Move ${leg.flightNumber} down`} disabled={index === legs.length - 1} onClick={() => move(index, 1)}>
                  <ArrowDownIcon className="h-3.5 w-3.5" />
                </IconAction>
                <button
                  type="button"
                  onClick={() => setRemovingIndex(index)}
                  className="ml-1 inline-flex items-center gap-1.5 rounded-lg border border-invalid/40 px-2.5 py-1.5 text-xs font-semibold text-invalid transition-colors hover:bg-invalid hover:text-white"
                >
                  <TrashIcon className="h-3.5 w-3.5" />
                  Remove
                </button>
              </span>
            </li>
          ))}
        </ol>

        <Button variant="primary" fullWidth className="mt-4" onClick={() => setAdding(true)}>
          <PlusIcon className="h-4 w-4" />
          Add leg
        </Button>

        <div className="mt-4">
          <InfoBox>Add, remove, or reorder legs. Saving immediately re-checks all pairing rules.</InfoBox>
        </div>
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
      className="rounded-lg border border-border-desc/40 p-1.5 text-primary-text/60 transition-colors hover:bg-page-bg disabled:cursor-not-allowed disabled:opacity-30"
    >
      {children}
    </button>
  )
}

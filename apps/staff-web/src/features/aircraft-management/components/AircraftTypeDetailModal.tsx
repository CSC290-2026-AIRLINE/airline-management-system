import { CABIN_CLASS_NAMES, layoutSummary, rowCount } from '../cabin'
import { ErrorMessage } from './StateMessage'
import { formatCurrency, formatNumber } from '../format'
import type { AircraftType } from '../types'

interface AircraftTypeDetailModalProps {
  aircraftType: AircraftType
  isWorking: boolean
  /** The error of the last action taken in this dialog, such as a refused retire. */
  error?: string | null
  onClose: () => void
  onClone: () => void
  onRetire: () => void
}

export function AircraftTypeDetailModal({ aircraftType, isWorking, error, onClose, onClone, onRetire }: AircraftTypeDetailModalProps) {
  const cabins = aircraftType.layout?.cabins ?? []
  const blockedSeats = cabins.reduce((total, cabin) => total + (cabin.blocked_seats?.length ?? 0), 0)

  return (
    <div className="f9-modal" role="dialog" aria-modal="true" aria-label={`Aircraft type ${aircraftType.code}`}>
      <div className="f9-modal__card f9-modal__card--wide">
        <button type="button" className="f9-modal__close" onClick={onClose}>
          Close
        </button>

        <div className="f9-modal__head">
          <h2 className="f9-detail__tail">{aircraftType.code}</h2>
          <p className="f9-detail__sub">
            {aircraftType.manufacturer} {aircraftType.model}
          </p>
        </div>

        {error && (
          <div style={{ marginTop: 14 }}>
            <ErrorMessage message={error} />
          </div>
        )}

        <div className="f9-detail__list" style={{ marginTop: 18 }}>
          <div className="f9-typerow">
            <span>Max takeoff weight</span>
            <span>{formatNumber(aircraftType.max_takeoff_weight_kg)} kg</span>
          </div>
          <div className="f9-typerow">
            <span>Status</span>
            <span>{aircraftType.is_active ? 'active' : 'retired'}</span>
          </div>
          <div className="f9-typerow">
            <span>Hold weight limit</span>
            <span>{formatNumber(aircraftType.hold_weight_limit_kg)} kg</span>
          </div>
          <div className="f9-typerow">
            <span>Max range</span>
            <span>{formatNumber(aircraftType.max_range_km)} km</span>
          </div>
          <div className="f9-typerow">
            <span>Min turnaround</span>
            <span>{aircraftType.min_turnaround_minutes} min</span>
          </div>
          <div className="f9-typerow">
            <span>Operating cost</span>
            <span>{formatCurrency(aircraftType.operating_cost_per_hour, aircraftType.cost_currency, 0)} / hour</span>
          </div>
          <div className="f9-typerow">
            <span>Total seats</span>
            <span>{formatNumber(aircraftType.total_seats)}</span>
          </div>
          <div className="f9-typerow">
            <span>Blocked seats</span>
            <span>{formatNumber(blockedSeats)}</span>
          </div>
        </div>

        <h3 className="f9-label f9-modal__section">CABINS</h3>
        {cabins.map((cabin, index) => (
          <div className="f9-typecabin" key={`${cabin.cabin_class}-${index}`}>
            <span>
              {CABIN_CLASS_NAMES[cabin.cabin_class]} (rows {cabin.first_row}-{cabin.last_row})
            </span>
            <span>
              {rowCount(cabin)} rows · {layoutSummary(cabin.columns, cabin.aisle_after ?? [])}
            </span>
          </div>
        ))}

        <p className="f9-note f9-note--warn">
          Layout is locked. To change it, clone this type (the clone starts with this layout) and retire the old one.
        </p>

        <div className="f9-modal__actions f9-modal__actions--start">
          <button type="button" className="f9-btn" disabled={isWorking} onClick={onClone}>
            Clone type
          </button>
          <button type="button" className="f9-btn f9-btn--outline" disabled={isWorking} onClick={onRetire}>
            {aircraftType.is_active ? 'Retire type' : 'Reactivate type'}
          </button>
        </div>
      </div>
    </div>
  )
}

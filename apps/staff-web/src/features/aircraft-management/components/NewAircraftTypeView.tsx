import { useMemo, useState, type FormEvent } from 'react'
import { createAircraftType } from '../api/aircraftType'
import { errorMessage } from '../api/http'
import { CABIN_CLASS_NAMES, CABIN_CLASS_OPTIONS, SEAT_LAYOUT_OPTIONS, capacityOf, layoutSummary } from '../cabin'
import { useApiFetcher } from '../hooks/useApiFetcher'
import { type CabinClass, type CabinLayout } from '../types'
import { SeatMapPreview } from './SeatMapPreview'

interface DraftCabin {
  id: string
  cabin_class: CabinClass
  first_row: number
  last_row: number
  columns: string[]
  aisle_after: string[]
  blocked_seats: string[]
  row_types: Record<string, number[]>
}

interface NewAircraftTypeViewProps {
  onCancel: () => void
  onSaved: () => void
}

function toNumber(value: string): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function NewAircraftTypeView({ onCancel, onSaved }: NewAircraftTypeViewProps) {
  const fetcher = useApiFetcher()

  const [code, setCode] = useState('')
  const [manufacturer, setManufacturer] = useState('')
  const [model, setModel] = useState('')
  const [holdWeightLimit, setHoldWeightLimit] = useState('')
  const [maxTakeoffWeight, setMaxTakeoffWeight] = useState('')
  const [maxRange, setMaxRange] = useState('')
  const [minTurnaround, setMinTurnaround] = useState('')
  const [operatingCost, setOperatingCost] = useState('')
  const [costCurrency, setCostCurrency] = useState('USD')

  const [cabins, setCabins] = useState<DraftCabin[]>([])
  const [draftClass, setDraftClass] = useState<CabinClass>('economy')
  const [draftFirstRow, setDraftFirstRow] = useState('')
  const [draftLastRow, setDraftLastRow] = useState('')
  const [draftLayoutId, setDraftLayoutId] = useState(SEAT_LAYOUT_OPTIONS[0].id)

  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const previewCabins = useMemo<CabinLayout[]>(
    () =>
      cabins.map((cabin) => ({
        cabin_class: cabin.cabin_class,
        first_row: cabin.first_row,
        last_row: cabin.last_row,
        columns: cabin.columns,
        aisle_after: cabin.aisle_after,
        blocked_seats: cabin.blocked_seats,
        row_types: cabin.row_types,
      })),
    [cabins],
  )

  const capacity = useMemo(() => capacityOf(previewCabins), [previewCabins])

  const handleAddCabin = () => {
    const firstRow = Math.trunc(toNumber(draftFirstRow))
    const lastRow = Math.trunc(toNumber(draftLastRow))
    const layout = SEAT_LAYOUT_OPTIONS.find((option) => option.id === draftLayoutId) ?? SEAT_LAYOUT_OPTIONS[0]

    if (firstRow < 1 || lastRow < firstRow) {
      setError('Enter a first row and a last row; the last row has to be the same row or a later one.')
      return
    }

    setError(null)
    setCabins((current) => [
      ...current,
      {
        id: `${draftClass}-${firstRow}-${current.length}`,
        cabin_class: draftClass,
        first_row: firstRow,
        last_row: lastRow,
        columns: layout.columns,
        aisle_after: layout.aisleAfter,
        blocked_seats: [],
        row_types: {},
      },
    ])
    setDraftFirstRow('')
    setDraftLastRow('')
  }

  const handleRemoveCabin = (id: string) => {
    setCabins((current) => current.filter((cabin) => cabin.id !== id))
  }

  const handleToggleSeat = (cabinIndex: number, seat: string) => {
    setCabins((current) =>
      current.map((cabin, index) => {
        if (index !== cabinIndex) {
          return cabin
        }
        const blocked = new Set(cabin.blocked_seats)
        if (blocked.has(seat)) {
          blocked.delete(seat)
        } else {
          blocked.add(seat)
        }
        return { ...cabin, blocked_seats: [...blocked].sort() }
      }),
    )
  }

  const handleCycleRow = (cabinIndex: number, row: number) => {
    setCabins((current) =>
      current.map((cabin, index) => {
        if (index !== cabinIndex) {
          return cabin
        }

        const rowTypes: Record<string, number[]> = {}
        for (const [type, rows] of Object.entries(cabin.row_types)) {
          const kept = rows.filter((value) => value !== row)
          if (kept.length > 0) {
            rowTypes[type] = kept
          }
        }

        const currentType = Object.entries(cabin.row_types).find(([, rows]) => rows.includes(row))?.[0] ?? 'normal'
        const nextType = currentType === 'exit_row' ? 'extra_legroom' : currentType === 'extra_legroom' ? 'normal' : 'exit_row'
        if (nextType !== 'normal') {
          rowTypes[nextType] = [...(rowTypes[nextType] ?? []), row].sort((a, b) => a - b)
        }

        return { ...cabin, row_types: rowTypes }
      }),
    )
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()

    if (!code.trim() || !manufacturer.trim() || !model.trim()) {
      setError('Code, manufacturer and model are required.')
      return
    }
    if (cabins.length === 0) {
      setError('Add at least one cabin before saving.')
      return
    }
    if (costCurrency.trim().length !== 3) {
      setError('The cost currency is a three letter code, for example USD.')
      return
    }

    setError(null)
    setIsSaving(true)
    try {
      await createAircraftType(fetcher.current, {
        code: code.trim().toUpperCase(),
        manufacturer: manufacturer.trim(),
        model: model.trim(),
        layout: { cabins: previewCabins },
        hold_weight_limit_kg: Math.round(toNumber(holdWeightLimit)),
        max_takeoff_weight_kg: Math.round(toNumber(maxTakeoffWeight)),
        max_range_km: Math.round(toNumber(maxRange)),
        min_turnaround_minutes: Math.round(toNumber(minTurnaround)),
        operating_cost_per_hour: toNumber(operatingCost),
        cost_currency: costCurrency.trim().toUpperCase(),
        is_active: true,
      })
      onSaved()
    } catch (err) {
      setError(errorMessage(err, 'Failed to save the aircraft type'))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <>
      <div className="f9-typegrid">
        <div className="f9-stack">
          <div className="f9-typehead">
            <button type="button" className="f9-backlink" onClick={onCancel}>
              ← Aircraft Types
            </button>
            <h2 className="f9-heading">New Aircraft Type</h2>
          </div>

          {error && (
            <div className="f9-error" role="alert">
              <span>{error}</span>
            </div>
          )}

          <form id="new-aircraft-type" className="f9-card f9-card--pad f9-card--form" onSubmit={(event) => void handleSubmit(event)}>
            <div className="f9-formgrid">
              <label className="f9-field">
                <span className="f9-field__label">Code</span>
                <input
                  className="f9-input"
                  type="text"
                  placeholder="A320"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  required
                />
              </label>
              <label className="f9-field">
                <span className="f9-field__label">Hold weight limit (kg)</span>
                <input
                  className="f9-input"
                  type="number"
                  min={0}
                  value={holdWeightLimit}
                  onChange={(event) => setHoldWeightLimit(event.target.value)}
                />
              </label>
              <label className="f9-field">
                <span className="f9-field__label">Max takeoff weight (kg)</span>
                <input
                  className="f9-input"
                  type="number"
                  min={0}
                  value={maxTakeoffWeight}
                  onChange={(event) => setMaxTakeoffWeight(event.target.value)}
                />
              </label>
              <div aria-hidden="true" />
              <label className="f9-field">
                <span className="f9-field__label">Manufacturer</span>
                <input
                  className="f9-input"
                  type="text"
                  placeholder="Airbus"
                  value={manufacturer}
                  onChange={(event) => setManufacturer(event.target.value)}
                  required
                />
              </label>
              <label className="f9-field">
                <span className="f9-field__label">Model</span>
                <input
                  className="f9-input"
                  type="text"
                  placeholder="A320"
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                  required
                />
              </label>
              <label className="f9-field">
                <span className="f9-field__label">Max range (km)</span>
                <input className="f9-input" type="number" min={0} value={maxRange} onChange={(event) => setMaxRange(event.target.value)} />
              </label>
              <label className="f9-field">
                <span className="f9-field__label">Min turnaround (min)</span>
                <input
                  className="f9-input"
                  type="number"
                  min={0}
                  value={minTurnaround}
                  onChange={(event) => setMinTurnaround(event.target.value)}
                />
              </label>
              <label className="f9-field">
                <span className="f9-field__label">Operating cost per hour</span>
                <input
                  className="f9-input"
                  type="number"
                  min={0}
                  step="0.01"
                  value={operatingCost}
                  onChange={(event) => setOperatingCost(event.target.value)}
                />
              </label>
              <label className="f9-field">
                <span className="f9-field__label">Cost currency</span>
                <input
                  className="f9-input"
                  type="text"
                  maxLength={3}
                  placeholder="USD"
                  value={costCurrency}
                  onChange={(event) => setCostCurrency(event.target.value)}
                  required
                />
              </label>
            </div>
          </form>

          <div className="f9-card f9-card--pad f9-card--cabins">
            <h3 className="f9-card__title">Cabins</h3>

            {cabins.length === 0 ? (
              <p className="f9-note" style={{ marginTop: 10 }}>
                No cabin yet. Add one below.
              </p>
            ) : (
              cabins.map((cabin) => (
                <div className="f9-cabinrow" key={cabin.id}>
                  <span>
                    <strong>{CABIN_CLASS_NAMES[cabin.cabin_class]}</strong>{' '}
                    <span className="f9-cabinrow__rows">
                      rows {cabin.first_row}-{cabin.last_row} · {layoutSummary(cabin.columns, cabin.aisle_after)}
                    </span>
                  </span>
                  <button type="button" className="f9-cabinrow__remove" onClick={() => handleRemoveCabin(cabin.id)}>
                    Remove
                  </button>
                </div>
              ))
            )}

            <div className="f9-addcabin">
              <p className="f9-addcabin__title">ADD CABIN</p>

              <label className="f9-field">
                <span className="f9-field__label">Class name</span>
                <select className="f9-select" value={draftClass} onChange={(event) => setDraftClass(event.target.value as CabinClass)}>
                  {CABIN_CLASS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="f9-formgrid" style={{ marginTop: 8 }}>
                <label className="f9-field">
                  <span className="f9-field__label">First row</span>
                  <input
                    className="f9-input"
                    type="number"
                    min={1}
                    value={draftFirstRow}
                    onChange={(event) => setDraftFirstRow(event.target.value)}
                  />
                </label>
                <label className="f9-field">
                  <span className="f9-field__label">Last row</span>
                  <input
                    className="f9-input"
                    type="number"
                    min={1}
                    value={draftLastRow}
                    onChange={(event) => setDraftLastRow(event.target.value)}
                  />
                </label>
              </div>

              <label className="f9-field" style={{ marginTop: 8 }}>
                <span className="f9-field__label">Seat layout (letters, "|" marks the aisle)</span>
                <select className="f9-select" value={draftLayoutId} onChange={(event) => setDraftLayoutId(event.target.value)}>
                  {SEAT_LAYOUT_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <button type="button" className="f9-btn f9-btn--outline f9-addcabin__add" onClick={handleAddCabin}>
                + Add cabin
              </button>

              <p className="f9-note f9-note--small" style={{ marginTop: 12 }}>
                Choose a class name and enter both row numbers to add this cabin.
              </p>
            </div>
          </div>

          <div>
            <p className="f9-note f9-note--warn">
              Once saved, this layout is permanent. To change it later, clone the type. Double-check row ranges, row types and blocked seats
              first.
            </p>
            <div className="f9-modal__actions" style={{ marginTop: 16 }}>
              <button type="button" className="f9-btn f9-btn--outline" onClick={onCancel}>
                Cancel
              </button>
              <button type="submit" form="new-aircraft-type" className="f9-btn" disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save aircraft type'}
              </button>
            </div>
          </div>
        </div>

        <div className="f9-stack f9-stack--tight">
          <div className="f9-card f9-card--pad f9-card--capacity">
            <h3 className="f9-card__title">Capacity summary</h3>
            <div className="f9-metrics">
              <div className="f9-metric">
                <div className="f9-metric__label">TOTAL SEATS</div>
                <div className="f9-metric__value">{capacity.total}</div>
              </div>
              <div className="f9-metric">
                <div className="f9-metric__label">BLOCKED</div>
                <div className="f9-metric__value f9-metric__value--red">{capacity.blocked}</div>
              </div>
              <div className="f9-metric">
                <div className="f9-metric__label">SELLABLE</div>
                <div className="f9-metric__value f9-metric__value--green">{capacity.sellable}</div>
              </div>
            </div>
          </div>

          <div className="f9-card">
            <SeatMapPreview cabins={previewCabins} onToggleSeat={handleToggleSeat} onCycleRow={handleCycleRow} />
          </div>
        </div>
      </div>
    </>
  )
}

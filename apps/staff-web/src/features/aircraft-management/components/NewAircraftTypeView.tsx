import { useMemo, useState, type FormEvent } from 'react'
import { cloneAircraftType, createAircraftType } from '../api/aircraftType'
import { errorMessage } from '../api/http'
import { CABIN_CLASS_NAMES, CABIN_CLASS_OPTIONS, SEAT_LAYOUT_OPTIONS, capacityOf, layoutSummary } from '../cabin'
import { CapacitySummary } from './CapacitySummary'
import { useApiFetcher } from '../hooks/useApiFetcher'
import { type AircraftType, type CabinClass, type CabinLayout } from '../types'
import { Button } from '@staff-web/components/ui/button'
import { Card, CardContent, CardTitle } from '@staff-web/components/ui/card'
import { Input } from '@staff-web/components/ui/input'
import { NativeSelect } from '@staff-web/components/ui/native-select'
import { Separator } from '@staff-web/components/ui/separator'
import { Field } from './Field'
import { ErrorMessage } from './StateMessage'
import { SeatMapPreview } from './SeatMapPreview'

interface DraftCabin {
  id: string
  cabin_class: CabinClass
  first_row: number
  last_row: number
  columns: string[]
  aisle_after: string[]
  skip_rows: number[]
  blocked_seats: string[]
  row_types: Record<string, number[]>
}

interface NewAircraftTypeViewProps {
  onCancel: () => void
  onSaved: (created: AircraftType) => void
  /** Clones this type: the figures are copied, and the code and the cabins are entered here. */
  cloneOf?: AircraftType
}

function draftFromLayout(cabin: CabinLayout, index: number): DraftCabin {
  return {
    id: `${cabin.cabin_class}-${cabin.first_row}-${index}`,
    cabin_class: cabin.cabin_class,
    first_row: cabin.first_row,
    last_row: cabin.last_row,
    columns: cabin.columns,
    aisle_after: cabin.aisle_after ?? [],
    skip_rows: cabin.skip_rows ?? [],
    blocked_seats: cabin.blocked_seats ?? [],
    row_types: cabin.row_types ?? {},
  }
}

/** Reads `13, 14` into rows; a value that is not a row number gives `null`. */
function parseRows(value: string): number[] | null {
  const parts = value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
  const rows = parts.map(Number)
  if (rows.some((row) => !Number.isInteger(row) || row < 1)) {
    return null
  }
  return [...new Set(rows)].sort((a, b) => a - b)
}

function toNumber(value: string): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function NewAircraftTypeView({ onCancel, onSaved, cloneOf }: NewAircraftTypeViewProps) {
  const fetcher = useApiFetcher()

  const [code, setCode] = useState(cloneOf ? `${cloneOf.code}-V2` : '')
  const [manufacturer, setManufacturer] = useState('')
  const [model, setModel] = useState('')
  const [holdWeightLimit, setHoldWeightLimit] = useState('')
  const [maxTakeoffWeight, setMaxTakeoffWeight] = useState('')
  const [maxRange, setMaxRange] = useState('')
  const [minTurnaround, setMinTurnaround] = useState('')
  const [operatingCost, setOperatingCost] = useState('')
  const [costCurrency, setCostCurrency] = useState('USD')

  const [cabins, setCabins] = useState<DraftCabin[]>(() => (cloneOf ? cloneOf.layout.cabins.map(draftFromLayout) : []))
  const [draftClass, setDraftClass] = useState<CabinClass>('economy')
  const [draftFirstRow, setDraftFirstRow] = useState('')
  const [draftLastRow, setDraftLastRow] = useState('')
  const [draftLayoutId, setDraftLayoutId] = useState(SEAT_LAYOUT_OPTIONS[0].id)
  const [draftSkipRows, setDraftSkipRows] = useState('')

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
        ...(cabin.skip_rows.length > 0 ? { skip_rows: cabin.skip_rows } : {}),
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

    const skipRows = parseRows(draftSkipRows)
    if (skipRows === null || skipRows.some((row) => row < firstRow || row > lastRow)) {
      setError(`Skipped rows are row numbers between ${firstRow} and ${lastRow}, separated by commas.`)
      return
    }
    if (cabins.some((cabin) => firstRow <= cabin.last_row && lastRow >= cabin.first_row)) {
      setError('This cabin shares rows with another cabin.')
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
        skip_rows: skipRows,
        blocked_seats: [],
        row_types: {},
      },
    ])
    setDraftFirstRow('')
    setDraftLastRow('')
    setDraftSkipRows('')
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

    if (!code.trim()) {
      setError('The code is required.')
      return
    }
    if (cabins.length === 0) {
      setError('Add at least one cabin before saving.')
      return
    }

    if (cloneOf) {
      setError(null)
      setIsSaving(true)
      try {
        onSaved(await cloneAircraftType(fetcher.current, cloneOf.id, code.trim().toUpperCase(), { cabins: previewCabins }))
      } catch (err) {
        setError(errorMessage(err, 'Failed to clone the aircraft type'))
      } finally {
        setIsSaving(false)
      }
      return
    }

    if (!manufacturer.trim() || !model.trim()) {
      setError('Code, manufacturer and model are required.')
      return
    }
    const wholeFigures: [string, string][] = [
      ['Hold weight limit', holdWeightLimit],
      ['Max takeoff weight', maxTakeoffWeight],
      ['Max range', maxRange],
      ['Min turnaround', minTurnaround],
    ]
    const badFigure = wholeFigures.find(([, value]) => !Number.isInteger(Number(value)) || Number(value) < 1)
    if (badFigure) {
      setError(`${badFigure[0]} has to be a whole number above zero.`)
      return
    }
    if (operatingCost.trim() === '' || !(Number(operatingCost) >= 0)) {
      setError('Operating cost per hour has to be zero or more.')
      return
    }
    if (costCurrency.trim().length !== 3) {
      setError('The cost currency is a three letter code, for example USD.')
      return
    }

    setError(null)
    setIsSaving(true)
    try {
      onSaved(
        await createAircraftType(fetcher.current, {
          code: code.trim().toUpperCase(),
          manufacturer: manufacturer.trim(),
          model: model.trim(),
          layout: { cabins: previewCabins },
          hold_weight_limit_kg: Number(holdWeightLimit),
          max_takeoff_weight_kg: Number(maxTakeoffWeight),
          max_range_km: Number(maxRange),
          min_turnaround_minutes: Number(minTurnaround),
          operating_cost_per_hour: Number(operatingCost),
          cost_currency: costCurrency.trim().toUpperCase(),
          is_active: true,
        }),
      )
    } catch (err) {
      setError(errorMessage(err, 'Failed to save the aircraft type'))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="f9-typegrid">
      <div className="f9-stack">
        <div className="f9-typehead">
          <Button type="button" variant="link" className="h-auto p-0" onClick={onCancel}>
            {cloneOf ? `← ${cloneOf.code}` : '← Aircraft Types'}
          </Button>
        </div>

        {error && <ErrorMessage message={error} />}

        <Card>
          <CardContent>
            <form id="new-aircraft-type" className="f9-formgrid" onSubmit={(event) => void handleSubmit(event)}>
              <Field label={cloneOf ? `Code of the clone of ${cloneOf.code}` : 'Code'} htmlFor="type-code">
                <Input id="type-code" placeholder="A320" value={code} onChange={(event) => setCode(event.target.value)} required />
              </Field>
              {!cloneOf && (
                <>
                  <Field label="Hold weight limit (kg)" htmlFor="type-hold">
                    <Input
                      id="type-hold"
                      type="number"
                      min={1}
                      required
                      value={holdWeightLimit}
                      onChange={(event) => setHoldWeightLimit(event.target.value)}
                    />
                  </Field>
                  <Field label="Max takeoff weight (kg)" htmlFor="type-mtow">
                    <Input
                      id="type-mtow"
                      type="number"
                      min={1}
                      required
                      value={maxTakeoffWeight}
                      onChange={(event) => setMaxTakeoffWeight(event.target.value)}
                    />
                  </Field>
                  <div aria-hidden="true" />
                  <Field label="Manufacturer" htmlFor="type-manufacturer">
                    <Input
                      id="type-manufacturer"
                      placeholder="Airbus"
                      value={manufacturer}
                      onChange={(event) => setManufacturer(event.target.value)}
                      required
                    />
                  </Field>
                  <Field label="Model" htmlFor="type-model">
                    <Input id="type-model" placeholder="A320" value={model} onChange={(event) => setModel(event.target.value)} required />
                  </Field>
                  <Field label="Max range (km)" htmlFor="type-range">
                    <Input
                      id="type-range"
                      type="number"
                      min={1}
                      required
                      value={maxRange}
                      onChange={(event) => setMaxRange(event.target.value)}
                    />
                  </Field>
                  <Field label="Min turnaround (min)" htmlFor="type-turnaround">
                    <Input
                      id="type-turnaround"
                      type="number"
                      min={1}
                      required
                      value={minTurnaround}
                      onChange={(event) => setMinTurnaround(event.target.value)}
                    />
                  </Field>
                  <Field label="Operating cost per hour" htmlFor="type-cost">
                    <Input
                      id="type-cost"
                      type="number"
                      min={0}
                      step="0.01"
                      required
                      value={operatingCost}
                      onChange={(event) => setOperatingCost(event.target.value)}
                    />
                  </Field>
                  <Field label="Cost currency" htmlFor="type-currency">
                    <Input
                      id="type-currency"
                      maxLength={3}
                      placeholder="USD"
                      value={costCurrency}
                      onChange={(event) => setCostCurrency(event.target.value)}
                      required
                    />
                  </Field>
                </>
              )}
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col gap-3">
            <CardTitle>Cabins</CardTitle>

            {cabins.length === 0 ? (
              <p className="text-sm text-muted-foreground">No cabin yet. Add one below.</p>
            ) : (
              cabins.map((cabin) => (
                <div className="flex items-center justify-between gap-3 rounded-md bg-muted px-3 py-2 text-sm" key={cabin.id}>
                  <span>
                    <strong>{CABIN_CLASS_NAMES[cabin.cabin_class]}</strong>{' '}
                    <span className="text-muted-foreground">
                      rows {cabin.first_row}-{cabin.last_row} · {layoutSummary(cabin.columns, cabin.aisle_after)}
                      {cabin.skip_rows.length > 0 ? ` · skips ${cabin.skip_rows.join(', ')}` : ''}
                    </span>
                  </span>
                  <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => handleRemoveCabin(cabin.id)}>
                    Remove
                  </Button>
                </div>
              ))
            )}

            <Separator />

            <div className="flex flex-col gap-3">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground">ADD CABIN</p>

              <Field label="Class name" htmlFor="cabin-class">
                <NativeSelect
                  id="cabin-class"
                  className="w-full"
                  value={draftClass}
                  onChange={(event) => setDraftClass(event.target.value as CabinClass)}
                >
                  {CABIN_CLASS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>

              <div className="f9-formgrid">
                <Field label="First row" htmlFor="cabin-first-row">
                  <Input
                    id="cabin-first-row"
                    type="number"
                    min={1}
                    value={draftFirstRow}
                    onChange={(event) => setDraftFirstRow(event.target.value)}
                  />
                </Field>
                <Field label="Last row" htmlFor="cabin-last-row">
                  <Input
                    id="cabin-last-row"
                    type="number"
                    min={1}
                    value={draftLastRow}
                    onChange={(event) => setDraftLastRow(event.target.value)}
                  />
                </Field>
              </div>

              <Field label="Skipped rows (optional, for example 13)" htmlFor="cabin-skip-rows">
                <Input
                  id="cabin-skip-rows"
                  placeholder="13"
                  value={draftSkipRows}
                  onChange={(event) => setDraftSkipRows(event.target.value)}
                />
              </Field>

              <Field label={'Seat layout (letters, "|" marks the aisle)'} htmlFor="cabin-layout">
                <NativeSelect
                  id="cabin-layout"
                  className="w-full"
                  value={draftLayoutId}
                  onChange={(event) => setDraftLayoutId(event.target.value)}
                >
                  {SEAT_LAYOUT_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>

              <div>
                <Button type="button" variant="outline" onClick={handleAddCabin}>
                  + Add cabin
                </Button>
              </div>

              <p className="text-xs text-muted-foreground">Choose a class name and enter both row numbers to add this cabin.</p>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <p className="text-sm text-amber-700">
            Once saved, this layout is permanent. To change it later, clone the type. Double-check row ranges, row types and blocked seats
            first.
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" form="new-aircraft-type" disabled={isSaving}>
              {isSaving ? 'Saving...' : cloneOf ? 'Save clone' : 'Save aircraft type'}
            </Button>
          </div>
        </div>
      </div>

      <div className="f9-stack f9-stack--tight">
        <Card>
          <CardContent className="flex flex-col gap-3">
            <CapacitySummary total={capacity.total} blocked={capacity.blocked} sellable={capacity.sellable} perCabin={capacity.perCabin} />
          </CardContent>
        </Card>

        <Card className="py-0">
          <SeatMapPreview cabins={previewCabins} onToggleSeat={handleToggleSeat} onCycleRow={handleCycleRow} />
        </Card>
      </div>
    </div>
  )
}

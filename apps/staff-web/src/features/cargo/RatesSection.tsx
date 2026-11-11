import { useEffect, useState, type FormEvent } from 'react'
import { CircleAlert, CircleCheck, TriangleAlert } from 'lucide-react'
import { Alert, AlertDescription } from '@staff-web/components/ui/alert'
import { Button } from '@staff-web/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@staff-web/components/ui/dialog'
import { Input } from '@staff-web/components/ui/input'
import { Label } from '@staff-web/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@staff-web/components/ui/select'
import { Skeleton } from '@staff-web/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@staff-web/components/ui/table'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@staff-web/components/ui/tooltip'
import { cn } from '@staff-web/lib/utils'
import { CargoApiError, useCargoApi, type CommodityType, type Rate, type RateBody } from './cargo-api'

/* ── Notices ───────────────────────────────────────────────────────── */

interface Notice {
  tone: 'success' | 'error'
  message: string
}

function NoticeBanner({ notice }: { notice: Notice }) {
  return (
    <Alert
      variant={notice.tone === 'error' ? 'destructive' : 'default'}
      className={cn(
        'mb-4',
        notice.tone === 'error' ? 'border-danger-line/40 bg-danger-soft' : 'border-success/30 bg-success-soft text-success-strong',
      )}
    >
      {notice.tone === 'error' ? <CircleAlert aria-hidden="true" /> : <CircleCheck aria-hidden="true" />}
      <AlertDescription className="text-current">{notice.message}</AlertDescription>
    </Alert>
  )
}

/* ── Distance bands ────────────────────────────────────────────────── */

interface DistanceBand {
  label: string
  min: number
  max: number | null
  dbMax: number | null
}

const DISTANCE_BANDS: DistanceBand[] = [
  { label: '0–999 km', min: 0, max: 999, dbMax: 1000 },
  { label: '1,000–2,999 km', min: 1000, max: 2999, dbMax: 3000 },
  { label: '3,000 km and over', min: 3000, max: null, dbMax: null },
]

interface RateRow {
  commodity_type_id: string
  commodity_type_name: string
  bands: { rate: Rate | null; rate_per_kg: number; min_charge: number }[]
}

function groupByType(rates: Rate[], activeCommodityTypes: CommodityType[]): RateRow[] {
  const map = new Map<string, RateRow>()

  for (const ct of activeCommodityTypes) {
    if (!ct.is_active) continue
    map.set(ct.id, {
      commodity_type_id: ct.id,
      commodity_type_name: ct.name,
      bands: DISTANCE_BANDS.map(() => ({ rate: null, rate_per_kg: 0, min_charge: 0 })),
    })
  }

  for (const rate of rates) {
    let row = map.get(rate.commodity_type_id)
    if (!row) {
      row = {
        commodity_type_id: rate.commodity_type_id,
        commodity_type_name: rate.cargo_commodity_type?.name ?? 'Unknown',
        bands: DISTANCE_BANDS.map(() => ({ rate: null, rate_per_kg: 0, min_charge: 0 })),
      }
      map.set(rate.commodity_type_id, row)
    }
    const bandIndex = DISTANCE_BANDS.findIndex((b) => rate.min_distance_km >= b.min && (b.max === null || rate.min_distance_km <= b.max))
    if (bandIndex >= 0) {
      row.bands[bandIndex] = { rate, rate_per_kg: Number(rate.rate_per_kg), min_charge: Number(rate.min_charge) }
    }
  }

  return Array.from(map.values())
}

function missingBandIndices(row: RateRow): number[] {
  return row.bands.reduce<number[]>((acc, b, i) => (b.rate === null ? [...acc, i] : acc), [])
}

/* ── Inline edit state ─────────────────────────────────────────────── */

interface EditState {
  bands: { rate_per_kg: string; min_charge: string }[]
}

function editStateFrom(row: RateRow): EditState {
  return {
    bands: row.bands.map((b) => ({
      rate_per_kg: b.rate ? String(b.rate_per_kg) : '',
      min_charge: b.rate ? String(b.min_charge) : '',
    })),
  }
}

/* ── Add dialog ────────────────────────────────────────────────────── */

interface IncompleteType {
  id: string
  name: string
  missing: number[]
}

function AddRateDialog({
  incompleteTypes,
  onClose,
  onSubmit,
}: {
  incompleteTypes: IncompleteType[]
  onClose: () => void
  onSubmit: (typeId: string, rates: RateBody[]) => Promise<void>
}) {
  const [typeId, setTypeId] = useState('')
  const [bandValues, setBandValues] = useState<Record<number, string>>({})
  const [minCharge, setMinCharge] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selected = incompleteTypes.find((t) => t.id === typeId)

  function updateBand(i: number, value: string) {
    setBandValues((prev) => ({ ...prev, [i]: value }))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (saving) return
    setError(null)

    if (!typeId || !selected) {
      setError('Select a commodity type.')
      return
    }

    const mc = Number(minCharge)
    if (!minCharge || isNaN(mc) || mc < 0) {
      setError('Enter a valid min charge.')
      return
    }

    const bodies: RateBody[] = []
    for (const i of selected.missing) {
      const rpk = Number(bandValues[i])
      if (!bandValues[i] || isNaN(rpk) || rpk <= 0) {
        setError(`Enter a valid rate per kg for ${DISTANCE_BANDS[i].label}.`)
        return
      }
      bodies.push({
        commodity_type_id: typeId,
        min_distance_km: DISTANCE_BANDS[i].min,
        max_distance_km: DISTANCE_BANDS[i].dbMax,
        rate_per_kg: rpk,
        min_charge: mc,
      })
    }

    setSaving(true)
    try {
      await onSubmit(typeId, bodies)
    } catch (err) {
      setError(err instanceof CargoApiError ? err.message : 'Failed to create rates.')
      setSaving(false)
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !saving) onClose()
      }}
    >
      <DialogContent aria-describedby={undefined} className="sm:max-w-lg">
        <DialogTitle className="text-lg font-bold">Add rate row</DialogTitle>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="add-rate-type">Commodity type</Label>
            <Select
              value={typeId}
              onValueChange={(v) => {
                setTypeId(v)
                setBandValues({})
                setMinCharge('')
              }}
            >
              <SelectTrigger id="add-rate-type">
                <SelectValue placeholder="Choose a type" />
              </SelectTrigger>
              <SelectContent>
                {incompleteTypes.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selected && (
            <>
              <p className="text-sm text-muted-foreground">
                Fill in prices for the missing distance band{selected.missing.length > 1 ? 's' : ''}.
              </p>
              {selected.missing.map((i) => (
                <div key={i} className="flex flex-col gap-1.5">
                  <Label htmlFor={`add-rate-band-${i}`}>{DISTANCE_BANDS[i].label} — rate per kg</Label>
                  <Input
                    id={`add-rate-band-${i}`}
                    type="number"
                    min={0}
                    step="0.01"
                    value={bandValues[i] ?? ''}
                    onChange={(e) => updateBand(i, e.target.value)}
                  />
                </div>
              ))}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="add-rate-min-charge">Min charge</Label>
                <Input
                  id="add-rate-min-charge"
                  type="number"
                  min={0}
                  step="0.01"
                  value={minCharge}
                  onChange={(e) => setMinCharge(e.target.value)}
                />
              </div>
            </>
          )}

          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !selected}>
              {saving ? 'Creating…' : 'Create'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/* ── Section ───────────────────────────────────────────────────────── */

export function RatesSection() {
  const api = useCargoApi()
  const [rates, setRates] = useState<Rate[]>([])
  const [commodityTypes, setCommodityTypes] = useState<CommodityType[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [editingTypeId, setEditingTypeId] = useState<string | null>(null)
  const [editState, setEditState] = useState<EditState | null>(null)
  const [saving, setSaving] = useState(false)
  const [showAdd, setShowAdd] = useState(false)

  async function reload() {
    const [ratesData, typesData] = await Promise.all([api.listRates(), api.listCommodityTypes()])
    setRates(Array.isArray(ratesData) ? ratesData : [])
    setCommodityTypes(Array.isArray(typesData) ? typesData : [])
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [ratesData, typesData] = await Promise.all([api.listRates(), api.listCommodityTypes()])
        if (!cancelled) {
          setRates(Array.isArray(ratesData) ? ratesData : [])
          setCommodityTypes(Array.isArray(typesData) ? typesData : [])
          setLoading(false)
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load rates.')
          setLoading(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const grouped = groupByType(rates, commodityTypes)

  const incompleteTypes: IncompleteType[] = grouped
    .filter((row) => {
      const ct = commodityTypes.find((c) => c.id === row.commodity_type_id)
      return ct?.is_active && missingBandIndices(row).length > 0
    })
    .map((row) => ({ id: row.commodity_type_id, name: row.commodity_type_name, missing: missingBandIndices(row) }))

  const allPriced = incompleteTypes.length === 0

  function startEdit(row: RateRow) {
    setNotice(null)
    setEditingTypeId(row.commodity_type_id)
    setEditState(editStateFrom(row))
  }

  function cancelEdit() {
    setEditingTypeId(null)
    setEditState(null)
  }

  async function saveEdit(row: RateRow) {
    if (!editState || saving) return
    setSaving(true)
    setNotice(null)
    try {
      for (let i = 0; i < DISTANCE_BANDS.length; i++) {
        const band = DISTANCE_BANDS[i]
        const existing = row.bands[i].rate
        const ratePerKg = Number(editState.bands[i].rate_per_kg)
        const minCharge = Number(editState.bands[i].min_charge)

        if (existing) {
          await api.updateRate(existing.id, { rate_per_kg: ratePerKg, min_charge: minCharge })
        } else if (ratePerKg > 0) {
          await api.createRate({
            commodity_type_id: row.commodity_type_id,
            min_distance_km: band.min,
            max_distance_km: band.dbMax,
            rate_per_kg: ratePerKg,
            min_charge: minCharge,
          })
        }
      }
      await reload()
      cancelEdit()
      setNotice({ tone: 'success', message: `${row.commodity_type_name} rates saved.` })
    } catch (err) {
      setNotice({
        tone: 'error',
        message: err instanceof CargoApiError ? err.message : 'Failed to save rates.',
      })
    } finally {
      setSaving(false)
    }
  }

  async function handleAdd(_typeId: string, bodies: RateBody[]) {
    for (const body of bodies) {
      await api.createRate(body)
    }
    await reload()
    setShowAdd(false)
    setNotice({ tone: 'success', message: 'Rates added.' })
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-3" role="status">
        <span className="sr-only">Loading rates…</span>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </div>
    )
  }

  if (loadError) {
    return (
      <div role="alert">
        <p className="mb-2 font-medium text-foreground">Failed to load rates</p>
        <p className="mb-4 text-sm text-muted-foreground">{loadError}</p>
        <Button type="button" onClick={() => window.location.reload()}>
          Retry
        </Button>
      </div>
    )
  }

  return (
    <div>
      {notice && <NoticeBanner notice={notice} />}

      {!allPriced && (
        <Alert variant="default" className="mb-4 border-orange-300 bg-orange-50 text-orange-800">
          <TriangleAlert className="text-orange-600" aria-hidden="true" />
          <AlertDescription className="text-current">
            {incompleteTypes.length} commodity type{incompleteTypes.length > 1 ? 's have' : ' has'} no price for some distances. Bookings
            for {incompleteTypes.length > 1 ? 'them' : 'it'} will be refused.
          </AlertDescription>
        </Alert>
      )}

      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Price per kg for each distance band. Every booking pays at least the minimum charge.
        </p>
        {allPriced ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0}>
                  <Button type="button" variant="outline" disabled>
                    Add rate row
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>All commodity types are priced</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setNotice(null)
              setShowAdd(true)
            }}
          >
            Add rate row
          </Button>
        )}
      </div>

      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="text-xs tracking-wide text-muted-foreground uppercase">Commodity type</TableHead>
            {DISTANCE_BANDS.map((b) => (
              <TableHead key={b.label} className="text-xs tracking-wide text-muted-foreground uppercase">
                {b.label}
              </TableHead>
            ))}
            <TableHead className="text-xs tracking-wide text-muted-foreground uppercase">Min charge</TableHead>
            <TableHead>
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {grouped.map((row) => {
            const isEditing = editingTypeId === row.commodity_type_id && editState

            if (isEditing) {
              return (
                <TableRow key={row.commodity_type_id} className="bg-muted/30">
                  <TableCell className="font-bold text-foreground">{row.commodity_type_name}</TableCell>
                  {editState.bands.map((band, i) => (
                    <TableCell key={i}>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={band.rate_per_kg}
                        className="h-8 w-20"
                        onChange={(e) => {
                          const next = { ...editState }
                          next.bands = next.bands.map((b, j) => (j === i ? { ...b, rate_per_kg: e.target.value } : b))
                          setEditState(next)
                        }}
                      />
                    </TableCell>
                  ))}
                  <TableCell>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={editState.bands[0].min_charge}
                      className="h-8 w-20"
                      onChange={(e) => {
                        const next = { ...editState }
                        next.bands = next.bands.map((b) => ({ ...b, min_charge: e.target.value }))
                        setEditState(next)
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={cancelEdit} disabled={saving}>
                        Cancel
                      </Button>
                      <Button type="button" size="sm" onClick={() => saveEdit(row)} disabled={saving}>
                        {saving ? 'Saving…' : 'Save'}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            }

            return (
              <TableRow key={row.commodity_type_id}>
                <TableCell className="font-bold text-foreground">{row.commodity_type_name}</TableCell>
                {row.bands.map((band, i) => (
                  <TableCell key={i} className={cn('tabular-nums', band.rate ? 'text-muted-foreground' : 'text-orange-600')}>
                    {band.rate ? band.rate_per_kg.toFixed(2) : 'Not set'}
                  </TableCell>
                ))}
                <TableCell className={cn('tabular-nums', row.bands[0].rate ? 'text-muted-foreground' : 'text-orange-600')}>
                  {row.bands[0].rate ? row.bands[0].min_charge.toFixed(2) : 'Not set'}
                </TableCell>
                <TableCell>
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto p-0 text-primary"
                    onClick={() => startEdit(row)}
                    disabled={editingTypeId !== null}
                  >
                    Edit
                  </Button>
                </TableCell>
              </TableRow>
            )
          })}
          {grouped.length === 0 && (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={DISTANCE_BANDS.length + 3} className="py-8 text-center text-muted-foreground">
                No rates yet. Add a rate row to get started.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {showAdd && <AddRateDialog incompleteTypes={incompleteTypes} onClose={() => setShowAdd(false)} onSubmit={handleAdd} />}
    </div>
  )
}

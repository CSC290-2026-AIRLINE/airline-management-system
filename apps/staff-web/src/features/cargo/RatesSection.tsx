import { useEffect, useState, type FormEvent } from 'react'
import { CircleAlert, CircleCheck } from 'lucide-react'
import { Alert, AlertDescription } from '@staff-web/components/ui/alert'
import { Button } from '@staff-web/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@staff-web/components/ui/dialog'
import { Input } from '@staff-web/components/ui/input'
import { Label } from '@staff-web/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@staff-web/components/ui/select'
import { Skeleton } from '@staff-web/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@staff-web/components/ui/table'
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
}

const DISTANCE_BANDS: DistanceBand[] = [
  { label: '0–999 km', min: 0, max: 999 },
  { label: '1,000–2,999 km', min: 1000, max: 2999 },
  { label: '3,000 km and over', min: 3000, max: null },
]

interface RateRow {
  commodity_type_id: string
  commodity_type_name: string
  bands: { rate: Rate | null; rate_per_kg: number; min_charge: number }[]
}

function groupByType(rates: Rate[]): RateRow[] {
  const map = new Map<string, RateRow>()
  for (const rate of rates) {
    let row = map.get(rate.commodity_type_id)
    if (!row) {
      row = {
        commodity_type_id: rate.commodity_type_id,
        commodity_type_name: rate.commodity_type_name,
        bands: DISTANCE_BANDS.map(() => ({ rate: null, rate_per_kg: 0, min_charge: 0 })),
      }
      map.set(rate.commodity_type_id, row)
    }
    const bandIndex = DISTANCE_BANDS.findIndex((b) => rate.min_distance_km >= b.min && (b.max === null || rate.max_distance_km <= b.max))
    if (bandIndex >= 0) {
      row.bands[bandIndex] = { rate, rate_per_kg: rate.rate_per_kg, min_charge: rate.min_charge }
    }
  }
  return Array.from(map.values())
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

function AddRateDialog({
  commodityTypes,
  onClose,
  onSubmit,
}: {
  commodityTypes: CommodityType[]
  onClose: () => void
  onSubmit: (body: RateBody) => Promise<void>
}) {
  const [typeId, setTypeId] = useState('')
  const [minDist, setMinDist] = useState('')
  const [maxDist, setMaxDist] = useState('')
  const [ratePerKg, setRatePerKg] = useState('')
  const [minCharge, setMinCharge] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (saving) return
    setError(null)

    if (!typeId || !minDist || !maxDist || !ratePerKg || !minCharge) {
      setError('All fields are required.')
      return
    }

    setSaving(true)
    try {
      await onSubmit({
        commodity_type_id: typeId,
        min_distance_km: Number(minDist),
        max_distance_km: Number(maxDist),
        rate_per_kg: Number(ratePerKg),
        min_charge: Number(minCharge),
      })
    } catch (err) {
      setError(err instanceof CargoApiError ? err.message : 'Failed to create rate.')
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
            <Select value={typeId} onValueChange={setTypeId}>
              <SelectTrigger id="add-rate-type">
                <SelectValue placeholder="Choose a type" />
              </SelectTrigger>
              <SelectContent>
                {commodityTypes.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="add-rate-min">Min distance (km)</Label>
              <Input id="add-rate-min" type="number" min={0} value={minDist} onChange={(e) => setMinDist(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="add-rate-max">Max distance (km)</Label>
              <Input id="add-rate-max" type="number" min={0} value={maxDist} onChange={(e) => setMaxDist(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="add-rate-pkg">Rate per kg</Label>
              <Input id="add-rate-pkg" type="number" min={0} step="0.01" value={ratePerKg} onChange={(e) => setRatePerKg(e.target.value)} />
            </div>
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
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
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

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [ratesData, typesData] = await Promise.all([api.listRates(), api.listCommodityTypes()])
        if (!cancelled) {
          setRates(ratesData.rates)
          setCommodityTypes(typesData.commodity_types)
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

  const grouped = groupByType(rates)

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
      const updatedRates: Rate[] = []
      for (let i = 0; i < DISTANCE_BANDS.length; i++) {
        const band = DISTANCE_BANDS[i]
        const existing = row.bands[i].rate
        const ratePerKg = Number(editState.bands[i].rate_per_kg)
        const minCharge = Number(editState.bands[i].min_charge)

        if (existing) {
          const updated = await api.updateRate(existing.id, { rate_per_kg: ratePerKg, min_charge: minCharge })
          updatedRates.push(updated)
        } else if (ratePerKg > 0) {
          const created = await api.createRate({
            commodity_type_id: row.commodity_type_id,
            min_distance_km: band.min,
            max_distance_km: band.max ?? 999999,
            rate_per_kg: ratePerKg,
            min_charge: minCharge,
          })
          updatedRates.push(created)
        }
      }
      setRates((prev) => {
        const withoutOld = prev.filter((r) => !updatedRates.some((u) => u.id === r.id))
        return [...withoutOld, ...updatedRates]
      })
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

  async function handleAdd(body: RateBody) {
    const created = await api.createRate(body)
    setRates((prev) => [...prev, created])
    setShowAdd(false)
    setNotice({ tone: 'success', message: 'Rate row added.' })
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

      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Price per kg for each distance band. Every booking pays at least the minimum charge.
        </p>
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
                  <TableCell key={i} className="text-muted-foreground tabular-nums">
                    {band.rate ? band.rate_per_kg.toFixed(2) : '—'}
                  </TableCell>
                ))}
                <TableCell className="text-muted-foreground tabular-nums">
                  {row.bands[0].rate ? row.bands[0].min_charge.toFixed(2) : '—'}
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

      {showAdd && <AddRateDialog commodityTypes={commodityTypes} onClose={() => setShowAdd(false)} onSubmit={handleAdd} />}
    </div>
  )
}

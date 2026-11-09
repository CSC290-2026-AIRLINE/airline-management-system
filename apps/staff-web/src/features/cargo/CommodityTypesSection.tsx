import { useEffect, useState, type FormEvent } from 'react'
import { CircleAlert, CircleCheck } from 'lucide-react'
import { Alert, AlertDescription } from '@staff-web/components/ui/alert'
import { Badge } from '@staff-web/components/ui/badge'
import { Button } from '@staff-web/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@staff-web/components/ui/dialog'
import { Input } from '@staff-web/components/ui/input'
import { Label } from '@staff-web/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@staff-web/components/ui/select'
import { Skeleton } from '@staff-web/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@staff-web/components/ui/table'
import { cn } from '@staff-web/lib/utils'
import { CargoApiError, useCargoApi, type CommodityType, type CommodityTypeBody } from './cargo-api'

/* ── Handling-class badge colours ──────────────────────────────────── */

const CLASS_STYLES: Record<string, string> = {
  general: 'border-green-300 bg-green-50 text-green-700',
  perishable: 'border-orange-300 bg-orange-50 text-orange-700',
  dangerous: 'border-red-300 bg-red-50 text-red-700',
  live_animal: 'border-teal-300 bg-teal-50 text-teal-700',
}

const CLASS_OPTIONS = [
  { value: 'general', label: 'General' },
  { value: 'perishable', label: 'Perishable' },
  { value: 'dangerous', label: 'Dangerous' },
  { value: 'live_animal', label: 'Live animal' },
]

function ClassBadge({ value }: { value: string }) {
  const style = CLASS_STYLES[value] ?? 'border-border bg-muted text-muted-foreground'
  const label = CLASS_OPTIONS.find((o) => o.value === value)?.label ?? value
  return (
    <Badge variant="outline" className={cn('font-medium', style)}>
      {label}
    </Badge>
  )
}

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

/* ── Inline edit row ───────────────────────────────────────────────── */

interface EditState {
  name: string
  handling_class: string
  min_kg: string
  max_kg: string
  max_piece_kg: string
  is_active: boolean
}

function editStateFrom(row: CommodityType): EditState {
  return {
    name: row.name,
    handling_class: row.handling_class,
    min_kg: String(row.min_kg),
    max_kg: String(row.max_kg),
    max_piece_kg: String(row.max_piece_kg),
    is_active: row.is_active,
  }
}

/* ── Add dialog ────────────────────────────────────────────────────── */

function AddCommodityTypeDialog({ onClose, onSubmit }: { onClose: () => void; onSubmit: (body: CommodityTypeBody) => Promise<void> }) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [handlingClass, setHandlingClass] = useState('general')
  const [minKg, setMinKg] = useState('')
  const [maxKg, setMaxKg] = useState('')
  const [maxPieceKg, setMaxPieceKg] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (saving) return
    setError(null)

    if (!code.trim() || !name.trim() || !minKg || !maxKg || !maxPieceKg) {
      setError('All fields are required.')
      return
    }

    setSaving(true)
    try {
      await onSubmit({
        code: code.trim().toUpperCase(),
        name: name.trim(),
        handling_class: handlingClass,
        min_kg: Number(minKg),
        max_kg: Number(maxKg),
        max_piece_kg: Number(maxPieceKg),
        is_active: true,
      })
    } catch (err) {
      setError(err instanceof CargoApiError ? err.message : 'Failed to create commodity type.')
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
        <DialogTitle className="text-lg font-bold">Add commodity type</DialogTitle>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="add-code">Code</Label>
              <Input id="add-code" value={code} maxLength={10} placeholder="e.g. GEN" onChange={(e) => setCode(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="add-name">Name</Label>
              <Input
                id="add-name"
                value={name}
                maxLength={100}
                placeholder="e.g. General cargo"
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="add-class">Handling class</Label>
            <Select value={handlingClass} onValueChange={setHandlingClass}>
              <SelectTrigger id="add-class">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CLASS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="add-min">Min kg</Label>
              <Input id="add-min" type="number" min={0} value={minKg} onChange={(e) => setMinKg(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="add-max">Max kg</Label>
              <Input id="add-max" type="number" min={0} value={maxKg} onChange={(e) => setMaxKg(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="add-piece">Max piece kg</Label>
              <Input id="add-piece" type="number" min={0} value={maxPieceKg} onChange={(e) => setMaxPieceKg(e.target.value)} />
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

export function CommodityTypesSection() {
  const api = useCargoApi()
  const [rows, setRows] = useState<CommodityType[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editState, setEditState] = useState<EditState | null>(null)
  const [saving, setSaving] = useState(false)
  const [showAdd, setShowAdd] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await api.listCommodityTypes()
        if (!cancelled) {
          setRows(data.commodity_types)
          setLoading(false)
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load commodity types.')
          setLoading(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function startEdit(row: CommodityType) {
    setNotice(null)
    setEditingId(row.id)
    setEditState(editStateFrom(row))
  }

  function cancelEdit() {
    setEditingId(null)
    setEditState(null)
  }

  async function saveEdit(row: CommodityType) {
    if (!editState || saving) return
    setSaving(true)
    setNotice(null)
    try {
      const updated = await api.updateCommodityType(row.id, {
        name: editState.name.trim(),
        handling_class: editState.handling_class,
        min_kg: Number(editState.min_kg),
        max_kg: Number(editState.max_kg),
        max_piece_kg: Number(editState.max_piece_kg),
        is_active: editState.is_active,
      })
      setRows((prev) => prev.map((r) => (r.id === row.id ? updated : r)))
      cancelEdit()
      setNotice({ tone: 'success', message: `${updated.code} updated.` })
    } catch (err) {
      setNotice({ tone: 'error', message: err instanceof CargoApiError ? err.message : 'Failed to save.' })
    } finally {
      setSaving(false)
    }
  }

  async function handleAdd(body: CommodityTypeBody) {
    const created = await api.createCommodityType(body)
    setRows((prev) => [...prev, created])
    setShowAdd(false)
    setNotice({ tone: 'success', message: `${created.code} created.` })
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-3" role="status">
        <span className="sr-only">Loading commodity types…</span>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </div>
    )
  }

  if (loadError) {
    return (
      <div role="alert">
        <p className="mb-2 font-medium text-foreground">Failed to load commodity types</p>
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
        <p className="text-sm text-muted-foreground">Each commodity type has its own handling class and weight limits.</p>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setNotice(null)
            setShowAdd(true)
          }}
        >
          Add commodity type
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {['Code', 'Name', 'Class', 'Min', 'Max', 'Max per piece', 'Status', ''].map((h) => (
              <TableHead key={h} className="text-xs tracking-wide text-muted-foreground uppercase">
                {h}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const isEditing = editingId === row.id && editState

            if (isEditing) {
              return (
                <TableRow key={row.id} className="bg-muted/30">
                  <TableCell className="font-bold text-foreground">{row.code}</TableCell>
                  <TableCell>
                    <Input value={editState.name} className="h-8" onChange={(e) => setEditState({ ...editState, name: e.target.value })} />
                  </TableCell>
                  <TableCell>
                    <Select value={editState.handling_class} onValueChange={(v) => setEditState({ ...editState, handling_class: v })}>
                      <SelectTrigger className="h-8 w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CLASS_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        min={0}
                        value={editState.min_kg}
                        className="h-8 w-20"
                        onChange={(e) => setEditState({ ...editState, min_kg: e.target.value })}
                      />
                      <span className="text-xs text-muted-foreground">kg</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        min={0}
                        value={editState.max_kg}
                        className="h-8 w-24"
                        onChange={(e) => setEditState({ ...editState, max_kg: e.target.value })}
                      />
                      <span className="text-xs text-muted-foreground">kg</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        min={0}
                        value={editState.max_piece_kg}
                        className="h-8 w-20"
                        onChange={(e) => setEditState({ ...editState, max_piece_kg: e.target.value })}
                      />
                      <span className="text-xs text-muted-foreground">kg</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={editState.is_active ? 'active' : 'inactive'}
                      onValueChange={(v) => setEditState({ ...editState, is_active: v === 'active' })}
                    >
                      <SelectTrigger className="h-8 w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
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
              <TableRow key={row.id}>
                <TableCell className="font-bold text-foreground">{row.code}</TableCell>
                <TableCell className="text-foreground">{row.name}</TableCell>
                <TableCell>
                  <ClassBadge value={row.handling_class} />
                </TableCell>
                <TableCell className="text-muted-foreground">{row.min_kg} kg</TableCell>
                <TableCell className="text-muted-foreground">{Intl.NumberFormat().format(row.max_kg)} kg</TableCell>
                <TableCell className="text-muted-foreground">{row.max_piece_kg} kg</TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={cn(
                      'font-medium',
                      row.is_active ? 'border-green-300 bg-green-50 text-green-700' : 'border-border bg-muted text-muted-foreground',
                    )}
                  >
                    {row.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto p-0 text-primary"
                    onClick={() => startEdit(row)}
                    disabled={editingId !== null}
                  >
                    Edit
                  </Button>
                </TableCell>
              </TableRow>
            )
          })}
          {rows.length === 0 && (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                No commodity types yet. Add one to get started.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {isEditing(editingId, rows) && (
        <p className="mt-2 text-xs text-muted-foreground">
          Applies to new bookings only. Bookings already made keep {rows.find((r) => r.id === editingId)?.max_piece_kg} kg a piece.
        </p>
      )}

      {showAdd && <AddCommodityTypeDialog onClose={() => setShowAdd(false)} onSubmit={handleAdd} />}
    </div>
  )
}

function isEditing(editingId: string | null, rows: CommodityType[]): editingId is string {
  return editingId !== null && rows.some((r) => r.id === editingId)
}

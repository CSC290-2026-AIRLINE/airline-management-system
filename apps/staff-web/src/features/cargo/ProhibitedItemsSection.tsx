import { useEffect, useState, type FormEvent } from 'react'
import { CircleAlert, CircleCheck } from 'lucide-react'
import { Alert, AlertDescription } from '@staff-web/components/ui/alert'
import { Badge } from '@staff-web/components/ui/badge'
import { Button } from '@staff-web/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@staff-web/components/ui/dialog'
import { Input } from '@staff-web/components/ui/input'
import { Label } from '@staff-web/components/ui/label'
import { Skeleton } from '@staff-web/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@staff-web/components/ui/table'
import { cn } from '@staff-web/lib/utils'
import { CargoApiError, useCargoApi, type ProhibitedItem, type ProhibitedItemBody } from './cargo-api'

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

/* ── Inline edit state ─────────────────────────────────────────────── */

interface EditState {
  keyword: string
  reason: string
}

function editStateFrom(row: ProhibitedItem): EditState {
  return { keyword: row.keyword, reason: row.reason }
}

/* ── Add dialog ────────────────────────────────────────────────────── */

function AddKeywordDialog({ onClose, onSubmit }: { onClose: () => void; onSubmit: (body: ProhibitedItemBody) => Promise<void> }) {
  const [keyword, setKeyword] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (saving) return
    setError(null)

    if (!keyword.trim() || !reason.trim()) {
      setError('Both keyword and reason are required.')
      return
    }

    setSaving(true)
    try {
      await onSubmit({ keyword: keyword.trim().toLowerCase(), reason: reason.trim() })
    } catch (err) {
      setError(err instanceof CargoApiError ? err.message : 'Failed to add keyword.')
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
      <DialogContent aria-describedby={undefined} className="sm:max-w-md">
        <DialogTitle className="text-lg font-bold">Add keyword</DialogTitle>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="add-keyword">Keyword</Label>
            <Input
              id="add-keyword"
              value={keyword}
              maxLength={100}
              placeholder="e.g. weapon"
              onChange={(e) => setKeyword(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="add-reason">Reason</Label>
            <Input
              id="add-reason"
              value={reason}
              maxLength={500}
              placeholder="e.g. Weapons are not carried"
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Adding…' : 'Add'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/* ── Section ───────────────────────────────────────────────────────── */

export function ProhibitedItemsSection() {
  const api = useCargoApi()
  const [rows, setRows] = useState<ProhibitedItem[]>([])
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
        const data = await api.listProhibitedItems()
        if (!cancelled) {
          setRows(Array.isArray(data) ? data : [])
          setLoading(false)
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load prohibited items.')
          setLoading(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function startEdit(row: ProhibitedItem) {
    setNotice(null)
    setEditingId(row.id)
    setEditState(editStateFrom(row))
  }

  function cancelEdit() {
    setEditingId(null)
    setEditState(null)
  }

  async function saveEdit(row: ProhibitedItem) {
    if (!editState || saving) return
    setSaving(true)
    setNotice(null)
    try {
      const updated = await api.updateProhibitedItem(row.id, {
        keyword: editState.keyword.trim().toLowerCase(),
        reason: editState.reason.trim(),
      })
      setRows((prev) => prev.map((r) => (r.id === row.id ? updated : r)))
      cancelEdit()
      setNotice({ tone: 'success', message: `"${updated.keyword}" updated.` })
    } catch (err) {
      setNotice({ tone: 'error', message: err instanceof CargoApiError ? err.message : 'Failed to save.' })
    } finally {
      setSaving(false)
    }
  }

  async function toggleRetire(row: ProhibitedItem) {
    if (saving) return
    setSaving(true)
    setNotice(null)
    try {
      const updated = await api.updateProhibitedItem(row.id, { is_active: !row.is_active })
      setRows((prev) => prev.map((r) => (r.id === row.id ? updated : r)))
      setNotice({
        tone: 'success',
        message: updated.is_active ? `"${updated.keyword}" reactivated.` : `"${updated.keyword}" retired.`,
      })
    } catch (err) {
      setNotice({ tone: 'error', message: err instanceof CargoApiError ? err.message : 'Failed to update status.' })
    } finally {
      setSaving(false)
    }
  }

  async function handleAdd(body: ProhibitedItemBody) {
    const created = await api.createProhibitedItem(body)
    setRows((prev) => [...prev, created])
    setShowAdd(false)
    setNotice({ tone: 'success', message: `"${created.keyword}" added.` })
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-3" role="status">
        <span className="sr-only">Loading prohibited items…</span>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </div>
    )
  }

  if (loadError) {
    return (
      <div role="alert">
        <p className="mb-2 font-medium text-foreground">Failed to load prohibited items</p>
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
        <p className="text-sm text-muted-foreground">Bookings whose goods description contains an active keyword are refused.</p>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setNotice(null)
            setShowAdd(true)
          }}
        >
          Add keyword
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="text-xs tracking-wide text-muted-foreground uppercase">Keyword</TableHead>
            <TableHead className="text-xs tracking-wide text-muted-foreground uppercase">Reason</TableHead>
            <TableHead className="text-xs tracking-wide text-muted-foreground uppercase">Status</TableHead>
            <TableHead>
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const isEditing = editingId === row.id && editState

            if (isEditing) {
              return (
                <TableRow key={row.id} className="bg-muted/30">
                  <TableCell>
                    <Input
                      value={editState.keyword}
                      className="h-8"
                      onChange={(e) => setEditState({ ...editState, keyword: e.target.value })}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      value={editState.reason}
                      className="h-8"
                      onChange={(e) => setEditState({ ...editState, reason: e.target.value })}
                    />
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn(
                        'font-medium',
                        row.is_active ? 'border-green-300 bg-green-50 text-green-700' : 'border-border bg-muted text-muted-foreground',
                      )}
                    >
                      {row.is_active ? 'Active' : 'Retired'}
                    </Badge>
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
                <TableCell className="font-bold text-foreground">{row.keyword}</TableCell>
                <TableCell className="text-muted-foreground">{row.reason}</TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={cn(
                      'font-medium',
                      row.is_active ? 'border-green-300 bg-green-50 text-green-700' : 'border-border bg-muted text-muted-foreground',
                    )}
                  >
                    {row.is_active ? 'Active' : 'Retired'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex gap-3">
                    <Button
                      type="button"
                      variant="link"
                      className="h-auto p-0 text-primary"
                      onClick={() => startEdit(row)}
                      disabled={editingId !== null || saving}
                    >
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="link"
                      className="h-auto p-0 text-muted-foreground hover:text-foreground"
                      onClick={() => toggleRetire(row)}
                      disabled={editingId !== null || saving}
                    >
                      {row.is_active ? 'Retire' : 'Activate'}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
          {rows.length === 0 && (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                No prohibited items yet. Add a keyword to get started.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {showAdd && <AddKeywordDialog onClose={() => setShowAdd(false)} onSubmit={handleAdd} />}
    </div>
  )
}

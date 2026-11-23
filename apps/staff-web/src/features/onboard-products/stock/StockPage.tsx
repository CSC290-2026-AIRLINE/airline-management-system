// Stock page. Airport picker + Receive delivery button on the same row;
// warehouse stock table with Adjust stock per row; recent movements list.
// Fills the full width. No "Simulated today" badge or prototype footer.

import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { StockApiError, useOnboardApi } from '@staff-web/features/onboard-products/api'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@staff-web/components/ui/alert'
import { Badge } from '@staff-web/components/ui/badge'
import { Button } from '@staff-web/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@staff-web/components/ui/card'
import { Label } from '@staff-web/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@staff-web/components/ui/native-select'
import { Skeleton } from '@staff-web/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@staff-web/components/ui/table'
import { PageHeader, StatCard } from '@staff-web/features/onboard-products/ui'
import { AdjustStockDialog } from './AdjustStockDialog'
import { ManageListDialog, type ManageListItem } from './ManageListDialog'
import type { Product, StockBatch, StockMovement, Warehouse, WarehouseStockRow } from '@staff-web/features/onboard-products/api/types'

function formatQuantity(n: number): string {
  return n.toLocaleString('en-US')
}

function formatMoney(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function movementTypeLabel(type: StockMovement['type']): string {
  if (type === 'receive') return 'Receive'
  if (type === 'adjust') return 'Adjust'
  if (type === 'reserve') return 'Reserve'
  if (type === 'release') return 'Release'
  if (type === 'transfer') return 'Transfer'
  return 'Discard'
}

function reasonLabel(reason: StockMovement['reason']): string {
  if (reason == null) return ''
  if (reason === 'spoilage') return 'spoilage'
  if (reason === 'damage') return 'damage'
  if (reason === 'expired') return 'expired'
  return 'count correction'
}

// Roll up the per-batch unit cost (whatever the user typed in at receive
// delivery) into a single number for the row. We weight by the quantity
// each batch still holds, so a row with 80 units at $4 and 20 units at $5
// shows $4.20 as the unit cost and $436 as the total cost.
function summarizeBatches(batches: StockBatch[], productId: string, _products: Product[]): { unitCost: number; totalCost: number } | null {
  // Roll up the per-batch unit cost into a single number for the row. Weighted
  // by the quantity each batch still holds.
  void _products
  const matching = batches.filter((b) => b.productId === productId && b.quantityRemaining > 0)
  if (matching.length === 0) return null
  let totalQty = 0
  let totalCost = 0
  for (const b of matching) {
    totalQty += b.quantityRemaining
    totalCost += b.quantityRemaining * b.unitCostAmount
  }
  if (totalQty === 0) return null
  return { unitCost: totalCost / totalQty, totalCost }
}

export function StockPage() {
  const navigate = useNavigate()
  const search = useSearch({ from: '/_authenticated/catering/stock/' })
  const api = useOnboardApi()
  const stockApi = api.stock
  // Products are loaded once and reused so the recent-movements list can
  // resolve product names.
  const [products, setProducts] = useState<Product[]>([])
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [stock, setStock] = useState<WarehouseStockRow[]>([])
  const [batches, setBatches] = useState<StockBatch[]>([])
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [warehouseId, setWarehouseId] = useState<string | null>(null)
  const [adjusting, setAdjusting] = useState<WarehouseStockRow | null>(null)
  const [managingAirports, setManagingAirports] = useState(false)
  const [manageBusy, setManageBusy] = useState(false)

  function showToast(kind: 'success' | 'error', message: string) {
    if (kind === 'success') toast.success(message)
    else toast.error(message)
  }

  // Load products once for the warehouse stock derivation.
  useEffect(() => {
    let cancelled = false
    api.products
      .list()
      .then((data) => {
        if (cancelled) return
        setProducts(data)
      })
      .catch(() => {
        /* surfaced through other loads; non-fatal */
      })
    return () => {
      cancelled = true
    }
  }, [api])

  // Load warehouses once.
  useEffect(() => {
    let cancelled = false
    stockApi
      .listWarehouses()
      .then((data) => {
        if (cancelled) return
        setWarehouses(data)
        if (data.length > 0) {
          const initial = search.airport != null ? (data.find((w) => w.code === search.airport) ?? data[0]) : data[0]
          setWarehouseId(initial.id)
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setLoadError(err instanceof Error ? err.message : 'Could not load warehouses.')
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only set once from URL
  }, [])

  // Load stock + batches + movements for the chosen warehouse.
  useEffect(() => {
    if (warehouseId == null) return
    let cancelled = false
    Promise.all([
      stockApi.listWarehouseStock(warehouseId),
      stockApi.listStockBatches({ warehouseId }),
      stockApi.listStockMovements({ warehouseId }),
    ])
      .then(([stockData, batchData, movementData]) => {
        if (cancelled) return
        setStock(stockData)
        setBatches(batchData)
        setMovements(movementData)
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setLoadError(err instanceof Error ? err.message : 'Could not load warehouse stock.')
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [warehouseId, stockApi])

  // Re-load everything after a mutation.
  async function refresh() {
    if (warehouseId == null) return
    const [stockData, batchData, movementData] = await Promise.all([
      stockApi.listWarehouseStock(warehouseId),
      stockApi.listStockBatches({ warehouseId }),
      stockApi.listStockMovements({ warehouseId }),
    ])
    setStock(stockData)
    setBatches(batchData)
    setMovements(movementData)
  }

  async function refreshWarehouses() {
    const data = await stockApi.listWarehouses()
    setWarehouses(data)
    if (data.length > 0) {
      const stillThere = data.find((w) => w.id === warehouseId)
      if (!stillThere) setWarehouseId(data[0].id)
    } else {
      setWarehouseId(null)
    }
    return data
  }

  async function handleCreateAirport(input: { name: string; secondary: string }) {
    setManageBusy(true)
    try {
      const code = input.secondary === '' ? input.name : input.secondary
      await stockApi.createWarehouse({ code, name: input.name, airportCode: code })
      const data = await refreshWarehouses()
      showToast('success', `Added ${code} to the airport list.`)
      void data
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not add the airport.'
      showToast('error', message)
      throw err
    } finally {
      setManageBusy(false)
    }
  }

  async function handleUpdateAirport(id: string, input: { name: string; secondary: string }) {
    setManageBusy(true)
    try {
      const code = input.secondary === '' ? input.name : input.secondary
      await stockApi.updateWarehouse(id, { code, name: input.name, airportCode: code })
      await refreshWarehouses()
      showToast('success', `Updated airport details.`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not save the airport.'
      showToast('error', message)
      throw err
    } finally {
      setManageBusy(false)
    }
  }

  async function handleDeleteAirport(id: string) {
    setManageBusy(true)
    try {
      await stockApi.deleteWarehouse(id)
      await refreshWarehouses()
      showToast('success', 'Removed the airport.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not remove the airport.'
      if (err instanceof StockApiError) {
        throw err
      }
      showToast('error', message)
      throw err
    } finally {
      setManageBusy(false)
    }
  }

  const stats = useMemo(() => {
    const total = stock.length
    // The low-stock flag is the backend's own: a line is low when its
    // available quantity is at or below its reorder level.
    const low = stock.filter((r) => r.isLow).length
    const onHand = stock.reduce((acc, r) => acc + r.quantityOnHand, 0)
    const reserved = stock.reduce((acc, r) => acc + r.quantityReserved, 0)
    return { total, low, onHand, reserved }
  }, [stock])

  const currentWarehouse = warehouses.find((w) => w.id === warehouseId) ?? null

  if (loadError) {
    return (
      <Alert variant="destructive" role="alert">
        <AlertDescription>{loadError}</AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Stock"
        description="Stock held at each airport warehouse. Every airport keeps its own stock. Consumed and leftover items are reported by cabin crew after each flight."
      />

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4" aria-label="Stock stats">
        <StatCard label="Items stocked" value={stats.total} />
        <StatCard label="At or below reorder" value={stats.low} />
        <StatCard label="Units on hand" value={formatQuantity(stats.onHand)} />
        <StatCard label="Units reserved" value={formatQuantity(stats.reserved)} />
      </section>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex w-full max-w-xs flex-col gap-2">
          <Label htmlFor="stock-airport">Airport</Label>
          <NativeSelect id="stock-airport" className="w-full" value={warehouseId ?? ''} onChange={(e) => setWarehouseId(e.target.value)}>
            {warehouses.map((w) => (
              <NativeSelectOption key={w.id} value={w.id}>
                {w.code}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => setManagingAirports(true)}>
            Manage airports
          </Button>
          <Button
            type="button"
            onClick={() => {
              const code = currentWarehouse?.code ?? 'BKK'
              void navigate({ to: '/catering/stock/receive', search: { airport: code } })
            }}
          >
            Receive delivery
          </Button>
        </div>
      </div>

      <Card className="gap-4" aria-label={`${currentWarehouse?.code ?? ''} warehouse stock`}>
        <CardHeader>
          <CardTitle>{currentWarehouse ? `${currentWarehouse.code} warehouse` : 'Warehouse'}</CardTitle>
          <CardDescription>Reserved stock is held for paid orders and released on cancel or failed payment.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {loading ? (
            <div className="flex flex-col gap-2" aria-busy="true">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : stock.length === 0 ? (
            <p className="m-0 py-6 text-center text-sm text-muted-foreground">No stock yet. Use Receive delivery to add the first batch.</p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">On hand</TableHead>
                    <TableHead className="text-right">Reserved</TableHead>
                    <TableHead className="text-right">Available</TableHead>
                    <TableHead className="text-right">Reorder at</TableHead>
                    <TableHead className="text-right">Unit cost</TableHead>
                    <TableHead className="text-right">Total cost</TableHead>
                    <TableHead className="text-right">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stock.map((row) => {
                    // The available quantity and the low-stock flag come from the endpoint; the number is only clamped so an
                    // over-reserved line never shows a negative figure.
                    const available = Math.max(0, row.availableQuantity)
                    const low = row.isLow
                    const summary = summarizeBatches(batches, row.productId, products)
                    return (
                      <TableRow key={row.productId}>
                        <TableCell className="font-medium">{row.productName}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatQuantity(row.quantityOnHand)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatQuantity(row.quantityReserved)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          <span className="inline-flex items-center justify-end gap-2">
                            {low && <Badge variant="destructive">Reorder</Badge>}
                            <span className={low ? 'font-semibold text-destructive' : 'font-semibold'}>{formatQuantity(available)}</span>
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatQuantity(row.reorderLevel)}</TableCell>
                        <TableCell className="text-right tabular-nums">{summary ? formatMoney(summary.unitCost) : '—'}</TableCell>
                        <TableCell className="text-right tabular-nums">{summary ? formatMoney(summary.totalCost) : '—'}</TableCell>
                        <TableCell className="text-right">
                          <Button type="button" variant="outline" size="sm" onClick={() => setAdjusting(row)}>
                            Adjust stock
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>

              <div className="flex flex-col gap-2">
                <h3 className="m-0 text-base font-semibold">Recent movements</h3>
                {movements.length === 0 ? (
                  <p className="m-0 text-sm text-muted-foreground">No movements for this warehouse yet.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead>Item</TableHead>
                        <TableHead className="text-right">Quantity</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead className="text-right">When</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {movements
                        .slice()
                        .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
                        .slice(0, 12)
                        .map((m) => {
                          const product = products.find((p) => p.id === m.productId)
                          return (
                            <TableRow key={m.id}>
                              <TableCell>
                                <Badge variant={m.type === 'receive' ? 'secondary' : 'outline'}>{movementTypeLabel(m.type)}</Badge>
                              </TableCell>
                              <TableCell>{product?.name ?? m.productId}</TableCell>
                              <TableCell className={`text-right tabular-nums ${m.quantity >= 0 ? '' : 'text-destructive'}`}>
                                {m.quantity >= 0 ? `+${m.quantity}` : m.quantity}
                              </TableCell>
                              <TableCell className="text-muted-foreground">{m.reason ? reasonLabel(m.reason) : (m.note ?? '')}</TableCell>
                              <TableCell className="text-right text-muted-foreground">{formatDate(m.occurredAt)}</TableCell>
                            </TableRow>
                          )
                        })}
                    </TableBody>
                  </Table>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {adjusting && (
        <AdjustStockDialog
          row={adjusting}
          onClose={() => setAdjusting(null)}
          onSaved={async (message) => {
            setAdjusting(null)
            showToast('success', message)
            await refresh()
          }}
          onError={(message) => showToast('error', message)}
        />
      )}

      {managingAirports && (
        <ManageListDialog
          title="Manage airports"
          subtitle="Add the airport codes your catering team stocks. Stock is held per airport."
          nameLabel="Airport name"
          secondaryLabel="Code"
          secondaryRequired
          emptyMessage="No airports yet. Add one to start tracking stock."
          addLabel="Add airport"
          busy={manageBusy}
          items={warehouses.map<ManageListItem>((w) => ({
            id: w.id,
            name: w.name,
            secondary: w.code,
            isProtected: w.id === warehouseId,
            hint: w.id === warehouseId ? 'Currently selected' : undefined,
          }))}
          onClose={() => setManagingAirports(false)}
          onCreate={handleCreateAirport}
          onUpdate={handleUpdateAirport}
          onDelete={handleDeleteAirport}
        />
      )}

      <p className="m-0 text-sm">
        <Link to="/catering/offered-menu" className="text-muted-foreground underline underline-offset-4 hover:text-foreground">
          Back to offered menu
        </Link>
      </p>
    </div>
  )
}

// Stock page. Airport picker + Receive delivery button on the same row;
// warehouse stock table with Adjust stock per row; recent movements list.
// Fills the full width. No "Simulated today" badge or prototype footer.

import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import {
  createWarehouse,
  deleteWarehouse,
  listStockBatches,
  listStockMovements,
  listWarehouses,
  listWarehouseStock,
  StockApiError,
  updateWarehouse,
} from '@staff-web/features/onboard-products/api/stock'
import { mockProducts } from '@staff-web/features/onboard-products/mocks/products'
import { Toast, type ToastData, type ToastKind } from '@staff-web/features/onboard-products/catalog'
import { AdjustStockDialog } from './AdjustStockDialog'
import { ManageListDialog, type ManageListItem } from './ManageListDialog'
import type { StockBatch, StockMovement, Warehouse, WarehouseStockRow } from '@staff-web/features/onboard-products/api/types'
import styles from './StockPage.module.css'

function nextToastId(): number {
  return Date.now() + Math.floor(Math.random() * 1000)
}

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
function summarizeBatches(batches: StockBatch[], productId: string): { unitCost: number; totalCost: number } | null {
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
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [stock, setStock] = useState<WarehouseStockRow[]>([])
  const [batches, setBatches] = useState<StockBatch[]>([])
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [warehouseId, setWarehouseId] = useState<string | null>(null)
  const [adjusting, setAdjusting] = useState<WarehouseStockRow | null>(null)
  const [toast, setToast] = useState<ToastData | null>(null)
  const [managingAirports, setManagingAirports] = useState(false)
  const [manageBusy, setManageBusy] = useState(false)

  function showToast(kind: ToastKind, message: string) {
    setToast({ id: nextToastId(), kind, message })
  }

  // Load warehouses once.
  useEffect(() => {
    let cancelled = false
    listWarehouses()
      .then((data) => {
        if (cancelled) return
        setWarehouses(data)
        // ?airport=BKK preselects that airport's warehouse.
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
    Promise.all([listWarehouseStock(warehouseId), listStockBatches({ warehouseId }), listStockMovements({ warehouseId })])
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
  }, [warehouseId])

  // Re-load everything after a mutation.
  async function refresh() {
    if (warehouseId == null) return
    const [stockData, batchData, movementData] = await Promise.all([
      listWarehouseStock(warehouseId),
      listStockBatches({ warehouseId }),
      listStockMovements({ warehouseId }),
    ])
    setStock(stockData)
    setBatches(batchData)
    setMovements(movementData)
  }

  async function refreshWarehouses() {
    const data = await listWarehouses()
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
      await createWarehouse({ code, name: input.name, airportCode: code })
      const data = await refreshWarehouses()
      showToast('success', `Added ${code} to the airport list.`)
      // If a stock row was being viewed for the deleted warehouse,
      // refreshWarehouses already switched to the first available.
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
      await updateWarehouse(id, { code, name: input.name, airportCode: code })
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
      await deleteWarehouse(id)
      await refreshWarehouses()
      showToast('success', 'Removed the airport.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not remove the airport.'
      if (err instanceof StockApiError) {
        // The dialog shows the error inline; rethrow so the dialog can keep it open.
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
    const low = stock.filter((r) => r.quantityOnHand - r.quantityReserved < r.reorderLevel).length
    const onHand = stock.reduce((acc, r) => acc + r.quantityOnHand, 0)
    const reserved = stock.reduce((acc, r) => acc + r.quantityReserved, 0)
    return { total, low, onHand, reserved }
  }, [stock])

  const currentWarehouse = warehouses.find((w) => w.id === warehouseId) ?? null

  if (loadError) {
    return (
      <p className={styles.errorMessage} role="alert">
        {loadError}
      </p>
    )
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Stock</h1>
          <p className={styles.subtitle}>
            Stock held at each airport warehouse. Every airport keeps its own stock. Consumed and leftover items are reported by cabin crew
            after each flight.
          </p>
        </div>
      </header>

      {toast && <Toast toast={toast} onDismiss={() => setToast(null)} />}

      <section className={styles.stats} aria-label="Stock stats">
        <div className={styles.statCard}>
          <p className={styles.statLabel}>Items stocked</p>
          <p className={styles.statValue}>{stats.total}</p>
        </div>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>At or below reorder</p>
          <p className={styles.statValue}>{stats.low}</p>
        </div>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>Units on hand</p>
          <p className={styles.statValue}>{formatQuantity(stats.onHand)}</p>
        </div>
        <div className={styles.statCard}>
          <p className={styles.statLabel}>Units reserved</p>
          <p className={styles.statValue}>{formatQuantity(stats.reserved)}</p>
        </div>
      </section>

      <div className={styles.pickerRow}>
        <div className={styles.field}>
          <label htmlFor="stock-airport" className={styles.label}>
            Airport
          </label>
          <select id="stock-airport" className={styles.select} value={warehouseId ?? ''} onChange={(e) => setWarehouseId(e.target.value)}>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.code}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.buttonGroup}>
          <button type="button" className={styles.manageButton} onClick={() => setManagingAirports(true)}>
            Manage airports
          </button>
          <button
            type="button"
            className={styles.receiveButton}
            onClick={() => {
              const code = currentWarehouse?.code ?? 'BKK'
              void navigate({ to: '/catering/stock/receive', search: { airport: code } })
            }}
          >
            Receive delivery
          </button>
        </div>
      </div>

      <section className={styles.card} aria-label={`${currentWarehouse?.code ?? ''} warehouse stock`}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>{currentWarehouse ? `${currentWarehouse.code} warehouse` : 'Warehouse'}</h2>
          <p className={styles.cardSubtitle}>Reserved stock is held for paid orders and released on cancel or failed payment.</p>
        </div>

        {loading ? (
          <p className={styles.message}>Loading warehouse…</p>
        ) : stock.length === 0 ? (
          <p className={styles.message}>No stock yet. Use Receive delivery to add the first batch.</p>
        ) : (
          <>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <colgroup>
                  <col className={styles.colItem} />
                  <col className={styles.colNumeric} />
                  <col className={styles.colNumeric} />
                  <col className={styles.colNumeric} />
                  <col className={styles.colNumeric} />
                  <col className={styles.colNumeric} />
                  <col className={styles.colNumeric} />
                  <col className={styles.colActions} />
                </colgroup>
                <thead>
                  <tr>
                    <th scope="col" className={styles.thItem}>
                      Item
                    </th>
                    <th scope="col" className={styles.thNumeric}>
                      On hand
                    </th>
                    <th scope="col" className={styles.thNumeric}>
                      Reserved
                    </th>
                    <th scope="col" className={styles.thNumeric}>
                      Available
                    </th>
                    <th scope="col" className={styles.thNumeric}>
                      Reorder at
                    </th>
                    <th scope="col" className={styles.thNumeric}>
                      Unit cost
                    </th>
                    <th scope="col" className={styles.thNumeric}>
                      Total cost
                    </th>
                    <th scope="col" className={styles.thActions}>
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {stock.map((row) => {
                    const rawAvailable = row.quantityOnHand - row.quantityReserved
                    // Clamp to zero so over-reserved rows don't show a negative
                    // number to staff; the Reorder badge already flags them.
                    const available = Math.max(0, rawAvailable)
                    const low = rawAvailable < row.reorderLevel
                    const summary = summarizeBatches(batches, row.productId)
                    return (
                      <tr key={row.id} className={styles.row}>
                        <td className={styles.tdItem}>
                          <span className={styles.itemName}>{row.productName}</span>
                        </td>
                        <td className={styles.tdNumeric}>{formatQuantity(row.quantityOnHand)}</td>
                        <td className={styles.tdNumeric}>{formatQuantity(row.quantityReserved)}</td>
                        <td className={styles.tdNumeric}>
                          <span className={styles.availableCell}>
                            {low && <span className={styles.reorderBadge}>Reorder</span>}
                            <span className={low ? styles.availableLow : styles.availablePositive}>{formatQuantity(available)}</span>
                          </span>
                        </td>
                        <td className={styles.tdNumeric}>{formatQuantity(row.reorderLevel)}</td>
                        <td className={styles.tdNumeric}>{summary ? formatMoney(summary.unitCost) : '—'}</td>
                        <td className={styles.tdNumeric}>{summary ? formatMoney(summary.totalCost) : '—'}</td>
                        <td className={styles.tdActions}>
                          <button type="button" className={styles.adjustButton} onClick={() => setAdjusting(row)}>
                            Adjust stock
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <h3 className={styles.movementsHeader}>Recent movements</h3>
            {movements.length === 0 ? (
              <p className={styles.message}>No movements for this warehouse yet.</p>
            ) : (
              <div className={styles.movementsList}>
                {movements
                  .slice()
                  .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
                  .slice(0, 12)
                  .map((m) => {
                    const product = mockProducts.find((p) => p.id === m.productId)
                    return (
                      <div key={m.id} className={styles.movementRow}>
                        <span
                          className={`${styles.movementType} ${
                            m.type === 'receive' ? styles.movementTypeReceive : m.type === 'adjust' ? styles.movementTypeAdjust : ''
                          }`}
                        >
                          {movementTypeLabel(m.type)}
                        </span>
                        <span>{product?.name ?? m.productId}</span>
                        <span
                          className={`${styles.movementQty} ${m.quantity >= 0 ? styles.movementQtyPositive : styles.movementQtyNegative}`}
                        >
                          {m.quantity >= 0 ? `+${m.quantity}` : m.quantity}
                        </span>
                        <span className={styles.movementReason}>{m.reason ? reasonLabel(m.reason) : (m.note ?? '')}</span>
                        <span className={styles.movementTime}>{formatDate(m.occurredAt)}</span>
                      </div>
                    )
                  })}
              </div>
            )}
          </>
        )}
      </section>

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

      <p className={styles.subtitle}>
        <Link to="/catering/offered-menu" style={{ color: '#0b1a3a' }}>
          Back to offered menu
        </Link>
      </p>
    </div>
  )
}

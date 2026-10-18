// Receive delivery page. Pick airport and supplier, add rows for the items
// received (product, quantity, unit cost, editable expiry) with computed
// line total, and press Confirm receive. On save, each row becomes a batch
// and the warehouse stock goes up. The product select also offers an
// "Add new product…" entry that opens an inline dialog so the new item is
// immediately available on this delivery.
/* eslint-disable react-hooks/set-state-in-effect -- sync setState mirrors an external source or fires once on mount */

import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import {
  createSupplier,
  createPurchaseReceipt,
  deleteSupplier,
  listSuppliers,
  listWarehouses,
  StockApiError,
  updateSupplier,
} from '@staff-web/features/onboard-products/api/stock'
import { listProducts } from '@staff-web/features/onboard-products/api/products'
import { addDays } from '@staff-web/features/onboard-products/mocks/clock'
import { Toast, type ToastData, type ToastKind } from '@staff-web/features/onboard-products/catalog'
import type {
  Product,
  ProductCategory,
  PurchaseReceipt,
  PurchaseReceiptDraftLine,
  Supplier,
  Warehouse,
} from '@staff-web/features/onboard-products/api/types'
import { AddProductDialog } from './AddProductDialog'
import { ManageListDialog, type ManageListItem } from './ManageListDialog'
import styles from './ReceiveDeliveryPage.module.css'

const NEW_PRODUCT_SENTINEL = '__new__'

function nextToastId(): number {
  return Date.now() + Math.floor(Math.random() * 1000)
}

function formatMoney(amount: number): string {
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

interface Row {
  key: string
  productId: string
  quantity: string
  unitCost: string
  expiresAt: string
}

function defaultExpiryForCategory(category: ProductCategory): string {
  if (category === 'duty_free') return ''
  const days = category === 'meal' ? 2 : 180
  return addDays(days).slice(0, 10)
}

function emptyRow(usedProductIds: Set<string>, products: Product[]): Row {
  // Pick the first product not already on the page, so the user doesn't
  // immediately trigger a duplicate-product error.
  const next = products.find((p) => !usedProductIds.has(p.id))
  const product = next ?? products[0]
  return {
    key: `row-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    productId: next?.id ?? '',
    quantity: '',
    unitCost: '',
    expiresAt: product ? defaultExpiryForCategory(product.category) : addDays(2).slice(0, 10),
  }
}

function parseNumber(s: string): number | null {
  if (s.trim() === '') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : Number.NaN
}

export function ReceiveDeliveryPage() {
  const navigate = useNavigate()
  const search = useSearch({ from: '/_authenticated/catering/stock/receive' })

  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [warehouseId, setWarehouseId] = useState<string | null>(null)
  const [supplierId, setSupplierId] = useState<string>('')
  const [rows, setRows] = useState<Row[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<ToastData | null>(null)
  const [lastReceipt, setLastReceipt] = useState<PurchaseReceipt | null>(null)
  const [addingProductFor, setAddingProductFor] = useState<string | null>(null)
  const [addingProductPrevious, setAddingProductPrevious] = useState<string>('')
  const [managingSuppliers, setManagingSuppliers] = useState(false)
  const [supplierManageBusy, setSupplierManageBusy] = useState(false)

  function showToast(kind: ToastKind, message: string) {
    setToast({ id: nextToastId(), kind, message })
  }

  // Load warehouses + products once.
  useEffect(() => {
    let cancelled = false
    Promise.all([listWarehouses(), listProducts()])
      .then(([warehousesData, productsData]) => {
        if (cancelled) return
        setWarehouses(warehousesData)
        setProducts(productsData)
        // ?airport=BKK preselects that airport's warehouse.
        if (warehousesData.length > 0) {
          const initial =
            search.airport != null ? (warehousesData.find((w) => w.code === search.airport) ?? warehousesData[0]) : warehousesData[0]
          setWarehouseId(initial.id)
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setLoadError(err instanceof Error ? err.message : 'Could not load warehouses.')
      })
      .finally(() => {
        if (cancelled) return
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only set once from URL
  }, [])

  // Load suppliers for the chosen airport.
  useEffect(() => {
    if (warehouseId == null) return
    const wh = warehouses.find((w) => w.id === warehouseId)
    if (!wh) return
    let cancelled = false
    listSuppliers(wh.airportCode)
      .then((data) => {
        if (cancelled) return
        setSuppliers(data)
        // Default to the first active supplier when switching airports.
        const firstActive = data.find((s) => s.isActive) ?? data[0]
        setSupplierId(firstActive?.id ?? '')
      })
      .catch(() => {
        if (cancelled) return
        setSuppliers([])
        setSupplierId('')
      })
    return () => {
      cancelled = true
    }
  }, [warehouseId, warehouses])

  // Seed an empty row once the products list is available.
  useEffect(() => {
    if (rows.length === 0 && products.length > 0) {
      setRows([emptyRow(new Set(), products)])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed only once per products load
  }, [products])

  const usedProductIds = useMemo(() => new Set(rows.map((r) => r.productId).filter(Boolean)), [rows])

  const totals = useMemo(() => {
    let units = 0
    let total = 0
    let lineCount = 0
    for (const r of rows) {
      const q = parseNumber(r.quantity)
      const c = parseNumber(r.unitCost)
      if (q != null && c != null && q > 0 && c >= 0) {
        units += q
        total += q * c
        lineCount += 1
      }
    }
    return { units, total, lineCount }
  }, [rows])

  const activeSuppliers = useMemo(() => suppliers.filter((s) => s.isActive), [suppliers])

  const validation = useMemo(() => {
    const issues: string[] = []
    if (rows.length === 0) issues.push('Add at least one item.')
    if (!supplierId) issues.push('Pick a supplier.')
    const seen = new Set<string>()
    for (const r of rows) {
      if (!r.productId) {
        issues.push('Each row needs a product.')
        continue
      }
      if (seen.has(r.productId)) {
        issues.push('Two rows use the same product. Combine them or remove one.')
        continue
      }
      seen.add(r.productId)
      const q = parseNumber(r.quantity)
      const c = parseNumber(r.unitCost)
      if (q == null || q <= 0) issues.push('Each row needs a quantity greater than zero.')
      if (c == null || c < 0) issues.push('Unit cost must be 0 or more.')
    }
    return issues
  }, [rows, supplierId])

  function addRow() {
    setRows((prev) => [...prev, emptyRow(new Set(prev.map((r) => r.productId).filter(Boolean)), products)])
  }

  function removeRow(key: string) {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.key !== key)))
  }

  function patchRow(key: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }

  function onProductChange(rowKey: string, newProductId: string) {
    if (newProductId === NEW_PRODUCT_SENTINEL) {
      // Remember what was selected so we can revert if the user cancels the
      // new-product dialog. Empty rows (newly added via "+ Add item") start
      // with no product; in that case leave the sentinel and let the dialog
      // populate it on save.
      const current = rows.find((r) => r.key === rowKey)?.productId ?? ''
      setAddingProductFor(rowKey)
      setAddingProductPrevious(current)
      return
    }
    // When the product changes, reset the expiry to its category default so
    // the user doesn't carry over a date from a different category.
    const product = products.find((p) => p.id === newProductId)
    const newExpiry = product ? defaultExpiryForCategory(product.category) : ''
    patchRow(rowKey, { productId: newProductId, expiresAt: newExpiry })
  }

  async function onSubmit() {
    setError(null)
    if (validation.length > 0) {
      setError(validation[0])
      return
    }
    if (warehouseId == null) {
      setError('Pick an airport first.')
      return
    }
    const lines: PurchaseReceiptDraftLine[] = rows.map((r) => {
      const product = products.find((p) => p.id === r.productId)
      const fallback = product ? defaultExpiryForCategory(product.category) : ''
      const expiresAt = r.productId && product?.category === 'duty_free' ? null : r.expiresAt === '' ? fallback || null : r.expiresAt
      return {
        productId: r.productId,
        quantity: Number(r.quantity),
        unitCostAmount: Number(r.unitCost),
        expiresAt,
      }
    })
    setSubmitting(true)
    try {
      const receipt = await createPurchaseReceipt({ supplierId, warehouseId, lines })
      const totalUnits = lines.reduce((acc, l) => acc + l.quantity, 0)
      const totalCost = lines.reduce((acc, l) => acc + l.quantity * l.unitCostAmount, 0)
      const supplierName = suppliers.find((s) => s.id === supplierId)?.name ?? 'supplier'
      const warehouseCode = warehouses.find((w) => w.id === warehouseId)?.code ?? ''
      showToast(
        'success',
        `Received ${lines.length} items (${totalUnits} units, ${formatMoney(totalCost)}) from ${supplierName} into the ${warehouseCode} warehouse as ${lines.length} new batch${lines.length === 1 ? '' : 'es'}.`,
      )
      setLastReceipt(receipt)
      setRows([emptyRow(new Set(), products)])
    } catch (err) {
      if (err instanceof StockApiError) {
        setError(err.message)
      } else {
        const message = err instanceof Error ? err.message : 'Could not save the delivery.'
        setError(message)
        showToast('error', message)
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function refreshSuppliers() {
    const wh = warehouses.find((w) => w.id === warehouseId)
    if (!wh) {
      setSuppliers([])
      setSupplierId('')
      return
    }
    const data = await listSuppliers(wh.airportCode)
    setSuppliers(data)
    const stillThere = data.find((s) => s.id === supplierId)
    if (!stillThere) {
      const firstActive = data.find((s) => s.isActive) ?? data[0]
      setSupplierId(firstActive?.id ?? '')
    }
  }

  async function handleCreateSupplier(input: { name: string; secondary: string }) {
    const wh = warehouses.find((w) => w.id === warehouseId)
    if (!wh) throw new StockApiError('SUPPLIER_INVALID', 'Pick an airport first.')
    setSupplierManageBusy(true)
    try {
      const created = await createSupplier({
        name: input.name,
        airportCode: wh.airportCode,
        contact: input.secondary === '' ? null : input.secondary,
        isActive: true,
      })
      await refreshSuppliers()
      setSupplierId(created.id)
      showToast('success', `Added ${created.name}.`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not add the supplier.'
      showToast('error', message)
      throw err
    } finally {
      setSupplierManageBusy(false)
    }
  }

  async function handleUpdateSupplier(id: string, input: { name: string; secondary: string }) {
    setSupplierManageBusy(true)
    try {
      const updated = await updateSupplier(id, { name: input.name, contact: input.secondary === '' ? null : input.secondary })
      await refreshSuppliers()
      showToast('success', `Updated ${updated.name}.`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not save the supplier.'
      showToast('error', message)
      throw err
    } finally {
      setSupplierManageBusy(false)
    }
  }

  async function handleDeleteSupplier(id: string) {
    setSupplierManageBusy(true)
    try {
      await deleteSupplier(id)
      await refreshSuppliers()
      showToast('success', 'Removed the supplier.')
    } catch (err) {
      if (err instanceof StockApiError) throw err
      const message = err instanceof Error ? err.message : 'Could not remove the supplier.'
      showToast('error', message)
      throw err
    } finally {
      setSupplierManageBusy(false)
    }
  }

  if (loadError) {
    return (
      <p className={styles.error} role="alert">
        {loadError}
      </p>
    )
  }

  return (
    <div className={styles.page}>
      <Link to="/catering/stock" className={styles.backLink}>
        ← Back to Stock
      </Link>

      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Receive delivery</h1>
          <p className={styles.subtitle}>
            Record a supplier delivery into an airport warehouse. Each item you add becomes a batch with its own cost and expiry date.
          </p>
        </div>
      </header>

      {toast && <Toast toast={toast} onDismiss={() => setToast(null)} />}

      <section className={styles.card} aria-label="Delivery details">
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>Delivery details</h2>
          <p className={styles.cardSubtitle}>Purchase cost is what the airline pays. It is stored apart from the selling price.</p>
        </div>
        <div className={styles.fieldRow}>
          <div className={styles.field}>
            <label htmlFor="rd-airport" className={styles.label}>
              Airport
            </label>
            <select id="rd-airport" className={styles.select} value={warehouseId ?? ''} onChange={(e) => setWarehouseId(e.target.value)}>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.field}>
            <label htmlFor="rd-supplier" className={styles.label}>
              Supplier
            </label>
            <div className={styles.supplierRow}>
              <select
                id="rd-supplier"
                className={styles.select}
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                disabled={activeSuppliers.length === 0}
              >
                {activeSuppliers.length === 0 && <option value="">No active suppliers for this airport</option>}
                {activeSuppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <button type="button" className={styles.manageButton} onClick={() => setManagingSuppliers(true)}>
                Manage
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.card} aria-label="Items received">
        <div className={styles.cardHeaderRow}>
          <div>
            <h2 className={styles.cardTitle}>Items received</h2>
            <p className={styles.cardSubtitle}>Food expires 2 days after it is received. Nothing is saved until you confirm.</p>
          </div>
          <button type="button" className={styles.addButton} onClick={addRow}>
            + Add item
          </button>
        </div>

        {lastReceipt && (
          <p className={styles.successBanner} role="status">
            Received {lastReceipt.lines.length} items ({lastReceipt.lines.reduce((a, l) => a + l.quantity, 0)} units,{' '}
            {formatMoney(lastReceipt.lines.reduce((a, l) => a + l.lineTotal, 0))}) from{' '}
            {suppliers.find((s) => s.id === lastReceipt.supplierId)?.name ?? 'supplier'} as {lastReceipt.lines.length} new batch
            {lastReceipt.lines.length === 1 ? '' : 'es'} starting at {lastReceipt.lines[0]?.batchCode}.
          </p>
        )}

        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Product</th>
                <th scope="col" className={styles.qtyCell}>
                  Quantity
                </th>
                <th scope="col" className={styles.costCell}>
                  Unit cost (USD)
                </th>
                <th scope="col">Expiry</th>
                <th scope="col" className={styles.totalCell}>
                  Line total
                </th>
                <th scope="col" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const q = parseNumber(r.quantity)
                const c = parseNumber(r.unitCost)
                const lineTotal = q != null && c != null && q > 0 && c >= 0 ? q * c : null
                const product = products.find((p) => p.id === r.productId)
                const expiresDisabled = product?.category === 'duty_free'
                return (
                  <tr key={r.key}>
                    <td className={styles.productCell}>
                      <select
                        className={styles.select}
                        value={r.productId}
                        onChange={(e) => onProductChange(r.key, e.target.value)}
                        aria-label="Product"
                      >
                        {products.map((p) => (
                          <option key={p.id} value={p.id} disabled={p.id !== r.productId && usedProductIds.has(p.id)}>
                            {p.name}
                          </option>
                        ))}
                        <option value={NEW_PRODUCT_SENTINEL}>+ Add new product…</option>
                      </select>
                    </td>
                    <td className={styles.qtyCell}>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        className={styles.input}
                        value={r.quantity}
                        onChange={(e) => patchRow(r.key, { quantity: e.target.value })}
                        aria-label="Quantity"
                        style={{ textAlign: 'right' }}
                      />
                    </td>
                    <td className={styles.costCell}>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className={styles.input}
                        value={r.unitCost}
                        onChange={(e) => patchRow(r.key, { unitCost: e.target.value })}
                        aria-label="Unit cost"
                        style={{ textAlign: 'right' }}
                      />
                    </td>
                    <td>
                      <input
                        type="date"
                        className={styles.input}
                        value={r.expiresAt}
                        onChange={(e) => patchRow(r.key, { expiresAt: e.target.value })}
                        disabled={expiresDisabled}
                        aria-label="Expiry"
                      />
                    </td>
                    <td className={styles.totalCell}>{lineTotal != null ? formatMoney(lineTotal) : '—'}</td>
                    <td>
                      <button type="button" className={styles.removeButton} onClick={() => removeRow(r.key)} disabled={rows.length <= 1}>
                        Remove
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className={styles.footer}>
          <span className={styles.footerSummary}>
            {totals.lineCount} item{totals.lineCount === 1 ? '' : 's'} · {totals.units} units · total {formatMoney(totals.total)}
          </span>
          <div className={styles.footerActions}>
            <button
              type="button"
              className={styles.cancelButton}
              onClick={() => void navigate({ to: '/catering/stock' })}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="button"
              className={styles.confirmButton}
              onClick={() => void onSubmit()}
              disabled={submitting || validation.length > 0 || loading}
            >
              {submitting ? 'Saving…' : 'Confirm receive'}
            </button>
          </div>
        </div>
      </section>

      {addingProductFor !== null && (
        <AddProductDialog
          onClose={() => {
            // Revert the row to the previous product so it never carries the
            // sentinel value forward. If there was no previous product
            // (a freshly-added empty row), fall back to the first available.
            const prev = addingProductPrevious
            const fallback = products[0]?.id ?? ''
            const next = prev !== '' && prev !== NEW_PRODUCT_SENTINEL ? prev : fallback
            if (next !== '') {
              const product = products.find((p) => p.id === next)
              patchRow(addingProductFor, {
                productId: next,
                expiresAt: product ? defaultExpiryForCategory(product.category) : '',
              })
            }
            setAddingProductFor(null)
            setAddingProductPrevious('')
          }}
          onSaved={(created) => {
            setProducts((prev) => [...prev.filter((p) => p.id !== created.id), created])
            patchRow(addingProductFor, {
              productId: created.id,
              expiresAt: defaultExpiryForCategory(created.category),
            })
            setAddingProductFor(null)
            setAddingProductPrevious('')
            showToast('success', `Added ${created.name} and selected it on this row.`)
          }}
          onError={(message) => showToast('error', message)}
        />
      )}

      {managingSuppliers && (
        <ManageListDialog
          title="Manage suppliers"
          subtitle="Suppliers are scoped to one airport. Add new vendors or remove ones you no longer use."
          nameLabel="Supplier name"
          secondaryLabel="Contact"
          emptyMessage="No suppliers for this airport yet."
          addLabel="Add supplier"
          busy={supplierManageBusy}
          items={activeSuppliers.map<ManageListItem>((s) => ({
            id: s.id,
            name: s.name,
            secondary: s.contact ?? '',
            hint: !s.isActive ? 'Inactive' : undefined,
          }))}
          onClose={() => setManagingSuppliers(false)}
          onCreate={handleCreateSupplier}
          onUpdate={handleUpdateSupplier}
          onDelete={handleDeleteSupplier}
        />
      )}
    </div>
  )
}

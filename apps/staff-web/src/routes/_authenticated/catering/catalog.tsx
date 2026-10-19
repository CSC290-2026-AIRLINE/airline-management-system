// Product Catalog page. Matches the prototype at f12-ref/staff uiux/1.png:
// title, 4 stat cards, filter pills, products table
// with photo/name/category/type-code/price/status/kebab, and add/edit/delete flows.

import { useEffect, useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { ProductInUseError, useOnboardApi } from '@staff-web/features/onboard-products/api'
import type { Product, ProductCategory, SpecialMealCode } from '@staff-web/features/onboard-products/api/types'
import {
  ConfirmDeleteDialog,
  KebabMenu,
  PhotoPlaceholder,
  ProductDialog,
  Toast,
  type ToastData,
  type ToastKind,
} from '@staff-web/features/onboard-products/catalog'
import styles from './CatalogPage.module.css'

type Filter = 'all' | 'meals' | 'snacks-and-drinks' | 'duty-free'

const CATEGORY_LABEL: Record<ProductCategory, string> = {
  meal: 'Meal',
  snack: 'Snack and drink',
  beverage: 'Snack and drink',
  duty_free: 'Duty-free',
}

const TYPE_CODE_LABEL: Record<SpecialMealCode, string> = {
  STD: '-',
  VGML: 'VGML',
  MOML: 'MOML',
  KSML: 'KSML',
  DBML: 'DBML',
  GFML: 'GFML',
}

function matchesFilter(p: Product, filter: Filter): boolean {
  if (filter === 'all') return true
  if (filter === 'meals') return p.category === 'meal'
  if (filter === 'snacks-and-drinks') return p.category === 'snack' || p.category === 'beverage'
  return p.category === 'duty_free'
}

function nextToastId(): number {
  return Date.now() + Math.floor(Math.random() * 1000)
}

export const Route = createFileRoute('/_authenticated/catering/catalog')({
  component: CatalogPage,
})

function CatalogPage() {
  const api = useOnboardApi()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [dialogState, setDialogState] = useState<{ mode: 'closed' } | { mode: 'add' } | { mode: 'edit'; product: Product }>({
    mode: 'closed',
  })
  const [deleting, setDeleting] = useState<Product | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [toast, setToast] = useState<ToastData | null>(null)

  useEffect(() => {
    let cancelled = false
    api.products
      .list()
      .then((data) => {
        if (cancelled) return
        setProducts(data)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setLoadError(err instanceof Error ? err.message : 'Could not load products.')
      })
      .finally(() => {
        if (cancelled) return
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [api])

  const stats = useMemo(() => {
    const premium = products.filter((p) => p.isPremium).length
    const codes = new Set(products.filter((p) => p.typeCode !== 'STD').map((p) => p.typeCode))
    return {
      products: products.length,
      active: products.filter((p) => p.isActive).length,
      premiumMeals: premium,
      specialMealCodes: codes.size,
    }
  }, [products])

  const filtered = useMemo(() => products.filter((p) => matchesFilter(p, filter)), [products, filter])

  function showToast(kind: ToastKind, message: string) {
    setToast({ id: nextToastId(), kind, message })
  }

  async function handleToggle(product: Product) {
    try {
      const updated = await api.products.setActive(product.id, !product.isActive)
      setProducts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
      showToast(
        'success',
        updated.isActive
          ? `${updated.name} is now active and visible on every route that offers it.`
          : `${updated.name} is now off and hidden from the shop.`,
      )
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Could not change the status.')
    }
  }

  function handleSaved(saved: Product, isNew: boolean) {
    setProducts((prev) => (isNew ? [...prev, saved] : prev.map((p) => (p.id === saved.id ? saved : p))))
    setDialogState({ mode: 'closed' })
    if (isNew) {
      showToast('success', `Added ${saved.name} to the catalog. Switch it on for a route under Offered menu.`)
    } else {
      showToast('success', `Updated ${saved.name}.`)
    }
  }

  async function handleDelete() {
    if (!deleting) return
    setDeleteBusy(true)
    setDeleteError(null)
    try {
      await api.products.delete(deleting.id)
      setProducts((prev) => prev.filter((p) => p.id !== deleting.id))
      showToast('success', `Deleted ${deleting.name}.`)
      setDeleting(null)
    } catch (err) {
      if (err instanceof ProductInUseError) {
        setDeleteError(err.message)
      } else {
        setDeleteError(err instanceof Error ? err.message : 'Could not delete the product.')
      }
    } finally {
      setDeleteBusy(false)
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Product Catalog</h1>
          <p className={styles.subtitle}>
            Meals, snacks, drinks and duty-free items with their prices. What each route offers is set under Offered menu.
          </p>
        </div>
      </header>

      {toast && <Toast toast={toast} onDismiss={() => setToast(null)} />}

      <section className={styles.stats} aria-label="Catalog stats">
        <StatCard label="Products" value={stats.products} />
        <StatCard label="Active" value={stats.active} />
        <StatCard label="Premium meals" value={stats.premiumMeals} />
        <StatCard label="Special meal codes" value={stats.specialMealCodes} />
      </section>

      <div className={styles.controls}>
        <div className={styles.pills} role="tablist" aria-label="Filter products by category">
          {(
            [
              { id: 'all', label: 'All' },
              { id: 'meals', label: 'Meals' },
              { id: 'snacks-and-drinks', label: 'Snacks and drinks' },
              { id: 'duty-free', label: 'Duty-free' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              role="tab"
              aria-selected={filter === opt.id}
              className={`${styles.pill} ${filter === opt.id ? styles.pillActive : ''}`}
              onClick={() => setFilter(opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <button type="button" className={styles.addButton} onClick={() => setDialogState({ mode: 'add' })}>
          + Add product
        </button>
      </div>

      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>Products</h2>
          <p className={styles.cardSubtitle}>
            Switch a product off to hide it from the shop, or delete it for good. Existing orders keep their name and price.
          </p>
        </div>

        {loading ? (
          <p className={styles.message}>Loading products…</p>
        ) : loadError ? (
          <p className={styles.errorMessage} role="alert">
            {loadError}
          </p>
        ) : filtered.length === 0 ? (
          <p className={styles.message}>No products in this filter. Try a different category or add a new one.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col" className={styles.thPhoto}>
                    Photo
                  </th>
                  <th scope="col">Name</th>
                  <th scope="col">Category</th>
                  <th scope="col">Type code</th>
                  <th scope="col" className={styles.thPrice}>
                    Price
                  </th>
                  <th scope="col">Status</th>
                  <th scope="col" className={styles.thActions}>
                    <span className={styles.srOnly}>Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className={styles.row}>
                    <td className={styles.tdPhoto}>
                      <PhotoPlaceholder product={p} />
                    </td>
                    <td>
                      <span className={styles.name}>{p.name}</span>
                      {p.isPremium && <span className={styles.premiumBadge}>Premium</span>}
                    </td>
                    <td>{CATEGORY_LABEL[p.category]}</td>
                    <td>{TYPE_CODE_LABEL[p.typeCode]}</td>
                    <td className={styles.tdPrice}>{formatPrice(p.priceAmount)}</td>
                    <td>
                      <StatusSwitch
                        isActive={p.isActive}
                        onToggle={() => void handleToggle(p)}
                        ariaLabel={`Switch ${p.name} ${p.isActive ? 'off' : 'on'}`}
                      />
                    </td>
                    <td className={styles.tdActions}>
                      <KebabMenu
                        label={`Actions for ${p.name}`}
                        actions={[
                          { label: 'Edit', onSelect: () => setDialogState({ mode: 'edit', product: p }) },
                          {
                            label: 'Delete',
                            onSelect: () => {
                              setDeleteError(null)
                              setDeleting(p)
                            },
                            destructive: true,
                          },
                        ]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {dialogState.mode !== 'closed' && (
        <ProductDialog
          product={dialogState.mode === 'edit' ? dialogState.product : null}
          onClose={() => setDialogState({ mode: 'closed' })}
          onSaved={handleSaved}
          onError={(m) => showToast('error', m)}
        />
      )}

      {deleting && (
        <ConfirmDeleteDialog
          product={deleting}
          busy={deleteBusy}
          errorMessage={deleteError}
          onClose={() => {
            if (deleteBusy) return
            setDeleting(null)
            setDeleteError(null)
          }}
          onConfirm={() => void handleDelete()}
        />
      )}
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className={styles.statCard}>
      <p className={styles.statLabel}>{label}</p>
      <p className={styles.statValue}>{value}</p>
    </div>
  )
}

function StatusSwitch({ isActive, onToggle, ariaLabel }: { isActive: boolean; onToggle: () => void; ariaLabel: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={isActive}
      aria-label={ariaLabel}
      className={`${styles.statusSwitch} ${isActive ? styles.statusOn : styles.statusOff}`}
      onClick={onToggle}
    >
      <span className={styles.statusTrack} aria-hidden="true">
        <span className={styles.statusThumb} />
      </span>
      <span className={styles.statusLabel}>{isActive ? 'Active' : 'Off'}</span>
    </button>
  )
}

function formatPrice(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}

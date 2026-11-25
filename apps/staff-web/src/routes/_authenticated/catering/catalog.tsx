// Product Catalog page. Matches the prototype at f12-ref/staff uiux/1.png:
// title, 4 stat cards, filter pills, products table
// with photo/name/category/type-code/price/status/kebab, and add/edit/delete flows.

import { useEffect, useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { ProductInUseError, useOnboardApi } from '@staff-web/features/onboard-products/api'
import type { Product, ProductCategory, SpecialMealCode } from '@staff-web/features/onboard-products/api/types'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@staff-web/components/ui/alert'
import { Badge } from '@staff-web/components/ui/badge'
import { Button } from '@staff-web/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@staff-web/components/ui/card'
import { Skeleton } from '@staff-web/components/ui/skeleton'
import { Switch } from '@staff-web/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@staff-web/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@staff-web/components/ui/tabs'
import { PageHeader, StatCard } from '@staff-web/features/onboard-products/ui'
import { ConfirmDeleteDialog, KebabMenu, PhotoPlaceholder, ProductDialog } from '@staff-web/features/onboard-products/catalog'

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

  function showToast(kind: 'success' | 'error', message: string) {
    if (kind === 'success') toast.success(message)
    else toast.error(message)
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
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Product Catalog"
        description="Meals, snacks, drinks and duty-free items with their prices. What each route offers is set under Offered menu."
      />

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4" aria-label="Catalog stats">
        <StatCard label="Products" value={stats.products} />
        <StatCard label="Active" value={stats.active} />
        <StatCard label="Premium meals" value={stats.premiumMeals} />
        <StatCard label="Special meal codes" value={stats.specialMealCodes} />
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={filter} onValueChange={(value) => setFilter(value as Filter)}>
          <TabsList aria-label="Filter products by category" className="h-auto flex-wrap justify-start">
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'meals', label: 'Meals' },
                { id: 'snacks-and-drinks', label: 'Snacks and drinks' },
                { id: 'duty-free', label: 'Duty-free' },
              ] as const
            ).map((opt) => (
              <TabsTrigger key={opt.id} value={opt.id} className="px-4 py-2">
                {opt.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Button type="button" onClick={() => setDialogState({ mode: 'add' })}>
          <Plus aria-hidden="true" />
          Add product
        </Button>
      </div>

      <Card className="gap-4">
        <CardHeader>
          <CardTitle>Products</CardTitle>
          <CardDescription>
            Switch a product off to hide it from the shop, or delete it for good. Existing orders keep their name and price.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex flex-col gap-2" aria-busy="true">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : loadError ? (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{loadError}</AlertDescription>
            </Alert>
          ) : filtered.length === 0 ? (
            <p className="m-0 py-8 text-center text-sm text-muted-foreground">
              No products in this filter. Try a different category or add a new one.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Photo</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Type code</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-12">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <PhotoPlaceholder product={p} />
                    </TableCell>
                    <TableCell className="font-medium">
                      <span className="inline-flex flex-wrap items-center gap-2">
                        {p.name}
                        {p.isPremium && <Badge variant="secondary">Premium</Badge>}
                      </span>
                    </TableCell>
                    <TableCell>{CATEGORY_LABEL[p.category]}</TableCell>
                    <TableCell>{p.typeCode === 'STD' ? '-' : <Badge variant="outline">{TYPE_CODE_LABEL[p.typeCode]}</Badge>}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatPrice(p.priceAmount)}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                        <Switch
                          checked={p.isActive}
                          onCheckedChange={() => void handleToggle(p)}
                          aria-label={`Switch ${p.name} ${p.isActive ? 'off' : 'on'}`}
                        />
                        {p.isActive ? 'Active' : 'Off'}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
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
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

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

function formatPrice(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}

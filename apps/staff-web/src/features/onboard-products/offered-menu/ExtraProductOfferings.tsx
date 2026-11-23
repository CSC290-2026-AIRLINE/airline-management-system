import type { Cabin, Product, ProductOffering } from '../api/types'
import styles from './RouteDetailPage.module.css'

const groups = [
  { label: 'Snacks and drinks', categories: ['snack', 'beverage'] },
  { label: 'Duty-free products', categories: ['duty_free'] },
]

interface Props {
  products: Product[]
  offerings: ProductOffering[]
  cabin: Cabin
  routeId?: string | null
  flightId?: string | null
  onToggle: (productId: string, active: boolean) => void
}

export function ExtraProductOfferings({ products, offerings, cabin, routeId, flightId, onToggle }: Props) {
  const effectiveCabin = cabin === 'premium_economy' ? 'economy' : cabin
  const choices = new Map<string, ProductOffering>()
  for (const level of ['network', 'route', 'flight'] as const) {
    for (const row of offerings) {
      if (row.cabin !== effectiveCabin || row.scope !== level) continue
      if (level === 'route' && (!routeId || row.routeId !== routeId)) continue
      if (level === 'flight' && (!flightId || row.flightId !== flightId)) continue
      choices.set(row.productId, row)
    }
  }

  return groups.map(({ label, categories }) => {
    const items = products.filter((product) => product.isActive && categories.includes(product.category))
    return (
      <section key={label} aria-label={label}>
        <p className={styles.defaultMealHeader}>{label}</p>
        {items.length === 0 && <p className={styles.menuSubtitle}>No active products in the catalog.</p>}
        <div className={styles.chips}>
          {items.map((product) => {
            const active = choices.get(product.id)?.isActive ?? false
            return (
              <button
                key={product.id}
                type="button"
                aria-pressed={active}
                disabled={cabin === 'premium_economy'}
                className={active ? styles.chipActive : styles.chip}
                onClick={() => onToggle(product.id, !active)}
              >
                <span className={styles.chipIcon}>{active ? '✓' : '+'}</span>
                <span className={styles.chipName}>{product.name}</span>
              </button>
            )
          })}
        </div>
      </section>
    )
  })
}

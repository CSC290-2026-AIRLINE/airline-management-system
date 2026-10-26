// Three-button segmented control above the product list. Same visual
// language as the page-1 "Add more extra services" CTA: dark filled
// when active, white with border when inactive.

import type { CategoryTab } from './types'

interface Props {
  active: CategoryTab
  onSelect: (tab: CategoryTab) => void
}

const TABS: { id: CategoryTab; label: string }[] = [
  { id: 'meals', label: 'Meals' },
  { id: 'snacks', label: 'Snacks and drinks' },
  { id: 'duty-free', label: 'Duty-free' },
]

export function CategoryTabs({ active, onSelect }: Props) {
  return (
    <div className="flex gap-2 items-center flex-wrap" role="tablist" aria-label="Product category">
      {TABS.map((t) => {
        const isActive = active === t.id
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            data-active={isActive}
            className="px-4 py-2.5 rounded-lg text-sm font-semibold whitespace-nowrap border border-border bg-white text-foreground transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 data-[active=true]:bg-primary data-[active=true]:border-primary data-[active=true]:text-primary-foreground data-[active=true]:hover:bg-primary"
            onClick={() => onSelect(t.id)}
          >
            {t.label}
          </button>
        )
      })}
    </div>
  )
}

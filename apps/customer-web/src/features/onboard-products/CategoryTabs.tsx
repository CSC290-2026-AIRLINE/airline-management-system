// Tabs above the product list. The list itself is rendered by the page, so these are triggers only.

import { Tabs, TabsList, TabsTrigger } from '@customer-web/components/ui/tabs'
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
    <Tabs value={active} onValueChange={(value) => onSelect(value as CategoryTab)}>
      <TabsList variant="pill" aria-label="Product category" className="h-auto w-full flex-wrap justify-start sm:w-fit">
        {TABS.map((t) => (
          <TabsTrigger key={t.id} value={t.id} className="px-4 py-2">
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}

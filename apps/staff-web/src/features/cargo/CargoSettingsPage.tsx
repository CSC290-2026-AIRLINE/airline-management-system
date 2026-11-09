import { useState } from 'react'
import { Info } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@staff-web/components/ui/tabs'
import { CommodityTypesSection } from './CommodityTypesSection'
import { RatesSection } from './RatesSection'
import { ProhibitedItemsSection } from './ProhibitedItemsSection'
import { SettingsSection } from './SettingsSection'

const TABS = [
  { value: 'commodity-types', label: 'Commodity types' },
  { value: 'rate-table', label: 'Rate table' },
  { value: 'prohibited-items', label: 'Prohibited items' },
  { value: 'settings', label: 'Settings' },
] as const

type TabValue = (typeof TABS)[number]['value']

export function CargoSettingsPage() {
  const [activeTab, setActiveTab] = useState<TabValue>('commodity-types')

  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="m-0 font-sans text-2xl font-bold tracking-tight text-foreground">Rates And Settings</h1>
        <p className="text-sm text-muted-foreground">
          Commodity types and their limits, the price list, prohibited items and the cargo settings.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)} className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <TabsList variant="line" className="gap-2">
            {TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value} className="px-4 py-2 text-sm font-medium">
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
          <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
            <Info className="size-3.5" aria-hidden="true" />
            Changes apply to new bookings only
          </span>
        </div>

        <TabsContent value="commodity-types">
          <CommodityTypesSection />
        </TabsContent>
        <TabsContent value="rate-table">
          <RatesSection />
        </TabsContent>
        <TabsContent value="prohibited-items">
          <ProhibitedItemsSection />
        </TabsContent>
        <TabsContent value="settings">
          <SettingsSection />
        </TabsContent>
      </Tabs>
    </>
  )
}

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
    <main className="min-h-svh bg-page px-4 py-12 font-sans text-foreground md:px-8 lg:px-12">
      <div className="mx-auto max-w-6xl">
        <h1 className="m-0 font-sans text-4xl font-bold tracking-tight text-foreground">Rates And Settings</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Commodity types and their limits, the price list, prohibited items and the cargo settings.
        </p>

        <div className="mt-8 rounded-xl border border-border bg-background p-6">
          <div className="flex items-start justify-between gap-4">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)} className="w-full">
              <div className="flex items-center justify-between">
                <TabsList variant="line" className="gap-2">
                  {TABS.map((tab) => (
                    <TabsTrigger key={tab.value} value={tab.value} className="px-4 py-2 text-sm font-medium">
                      {tab.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Info className="size-3.5" aria-hidden="true" />
                  Changes apply to new bookings only
                </span>
              </div>

              <TabsContent value="commodity-types" className="mt-4">
                <CommodityTypesSection />
              </TabsContent>
              <TabsContent value="rate-table" className="mt-4">
                <RatesSection />
              </TabsContent>
              <TabsContent value="prohibited-items" className="mt-4">
                <ProhibitedItemsSection />
              </TabsContent>
              <TabsContent value="settings" className="mt-4">
                <SettingsSection />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </main>
  )
}

import { useNavigate } from '@tanstack/react-router'
import { Info } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@staff-web/components/ui/tabs'
import { Route } from '@staff-web/routes/_authenticated/cargo/settings'
import type { CargoSettingsTab } from '@staff-web/routes/_authenticated/cargo/settings'
import { CommodityTypesSection } from './CommodityTypesSection'
import { RatesSection } from './RatesSection'
import { ProhibitedItemsSection } from './ProhibitedItemsSection'
import { SettingsSection } from './SettingsSection'

const TABS = [
  { value: 'commodity-types', label: 'Commodity types' },
  { value: 'rates', label: 'Rate table' },
  { value: 'prohibited-items', label: 'Prohibited items' },
  { value: 'settings', label: 'Settings' },
] as const satisfies ReadonlyArray<{ value: CargoSettingsTab; label: string }>

export function CargoSettingsPage() {
  const { tab } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })

  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="m-0 font-sans text-2xl font-bold tracking-tight text-foreground">Rates And Settings</h1>
        <p className="text-sm text-muted-foreground">
          Commodity types and their limits, the price list, prohibited items and the cargo settings.
        </p>
      </div>

      <Tabs
        value={tab}
        onValueChange={(v) => navigate({ search: { tab: v as CargoSettingsTab }, replace: true })}
        className="flex flex-col gap-4"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <TabsList className="h-auto flex-wrap gap-1">
            {TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value} className="text-sm">
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
        <TabsContent value="rates">
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

import { Tabs, TabsList, TabsTrigger } from '@customer-web/components/ui/tabs'

export interface PageTab {
  /** What the tab shows. */
  value: string
  label: string
  /** Set for a tab that belongs to another feature: it is shown, but it cannot be opened yet. */
  disabled?: boolean
  /** The tooltip that says why the tab is not there yet. */
  hint?: string
}

interface PageTabsProps {
  tabs: PageTab[]
  /** The tab that is on. */
  value: string
  /** Called when the customer picks another tab. Left out when there is only one tab to pick. */
  onChange?: (value: string) => void
  /** What the group of tabs controls, for screen readers. */
  ariaLabel: string
}

/** The tabs above a page's content: shadcn's `Tabs`, with each tab opening its own page. */
export function PageTabs({ tabs, value, onChange, ariaLabel }: PageTabsProps) {
  return (
    <Tabs value={value} onValueChange={(next) => onChange?.(next)}>
      <TabsList aria-label={ariaLabel}>
        {tabs.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value} disabled={tab.disabled} title={tab.hint}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}

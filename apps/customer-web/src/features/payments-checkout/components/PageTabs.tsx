import { cn } from '@customer-web/lib/utils'

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
  /** The id of the panel the tabs control, so a screen reader can pair them up. */
  panelId?: string
}

/**
 * The tabs above a page's content, the way the frames draw them: a row of rounded boxes, with the open one outlined in
 * navy.
 *
 * A tab that another feature owns is drawn but not clickable, so the page shows the shape the frames show without
 * pretending the screen exists.
 */
export function PageTabs({ tabs, value, onChange, ariaLabel, panelId }: PageTabsProps) {
  return (
    <div role="tablist" aria-label={ariaLabel} className="flex flex-wrap items-center gap-3">
      {tabs.map((tab) => {
        const active = tab.value === value
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={active ? panelId : undefined}
            disabled={tab.disabled}
            title={tab.hint}
            onClick={() => onChange?.(tab.value)}
            className={cn(
              'rounded-lg border px-4 py-2 text-sm font-medium transition-colors',
              'focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
              active ? 'border-navy bg-card text-navy' : 'border-border bg-card text-foreground hover:border-navy/40',
              tab.disabled && 'cursor-not-allowed opacity-60 hover:border-border',
            )}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}

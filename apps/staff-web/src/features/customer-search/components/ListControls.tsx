import { Button } from '@staff-web/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@staff-web/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@staff-web/components/ui/tabs'
import { PAGE_SIZE_OPTIONS, type Page } from '../lib/search'
import type { PersonFilter } from '../types'

/** The `All | Account holders | Travellers` switch and the pagination footer. */

const FILTERS: ReadonlyArray<{ value: PersonFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'account-holder', label: 'Account holders' },
  { value: 'traveller', label: 'Travellers' },
]

interface SegmentedControlProps {
  value: PersonFilter
  onChange: (value: PersonFilter) => void
}

export function SegmentedControl({ value, onChange }: SegmentedControlProps) {
  return (
    <Tabs value={value} onValueChange={(next) => onChange(next as PersonFilter)}>
      <TabsList aria-label="Filter people by type">
        {FILTERS.map((filter) => (
          <TabsTrigger key={filter.value} value={filter.value}>
            {filter.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}

interface PaginationBarProps {
  page: Page<unknown>
  unit: string
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
  /** Desktop tables show the `Showing x–y of z` range; the 360px card does not. */
  showRange?: boolean
  /** The compact master-detail card omits the `Rows` label above the select. */
  showRowsLabel?: boolean
}

export function PaginationBar({ page, unit, onPageChange, onPageSizeChange, showRange = true, showRowsLabel = true }: PaginationBarProps) {
  const atStart = page.page <= 1
  const atEnd = page.page >= page.pageCount

  return (
    <footer className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm">
      {showRange ? (
        <p className="text-muted-foreground">
          Showing {page.from}–{page.to} of {page.total.toLocaleString('en-GB')} {unit}
        </p>
      ) : (
        <span />
      )}

      <div className="flex flex-wrap items-center gap-2">
        {showRowsLabel ? <span className="text-muted-foreground">Rows</span> : null}
        <Select value={String(page.pageSize)} onValueChange={(size) => onPageSizeChange(Number(size))}>
          <SelectTrigger size="sm" aria-label="Rows per page" className="w-16">
            <SelectValue />
          </SelectTrigger>
          <SelectContent side="top">
            {PAGE_SIZE_OPTIONS.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="button" variant="outline" size="sm" onClick={() => onPageChange(page.page - 1)} disabled={atStart}>
          Previous
        </Button>
        <span className="text-muted-foreground">
          Page {page.page} of {page.pageCount}
        </span>
        <Button type="button" variant="outline" size="sm" onClick={() => onPageChange(page.page + 1)} disabled={atEnd}>
          Next
        </Button>
      </div>
    </footer>
  )
}

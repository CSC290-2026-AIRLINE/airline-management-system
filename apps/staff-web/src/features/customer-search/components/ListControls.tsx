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
    <div className="cs-segmented" data-filter={value} role="radiogroup" aria-label="Filter people by type">
      {FILTERS.map((filter) => (
        <button
          key={filter.value}
          type="button"
          role="radio"
          aria-checked={value === filter.value}
          className={`cs-segmented__option ${value === filter.value ? 'is-active' : ''}`}
          onClick={() => onChange(filter.value)}
        >
          {filter.label}
        </button>
      ))}
    </div>
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
    <footer className="cs-pagination">
      {showRange ? (
        <p className="cs-pagination__range">
          Showing {page.from}–{page.to} of {page.total.toLocaleString('en-GB')} {unit}
        </p>
      ) : (
        <span />
      )}

      <div className="cs-pagination__controls">
        <label className="cs-rows">
          {showRowsLabel ? <span className="cs-rows__label">Rows</span> : null}
          <span className="cs-select">
            <select value={page.pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))} aria-label="Rows per page">
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </span>
        </label>

        <button type="button" className="cs-btn cs-btn--ghost" onClick={() => onPageChange(page.page - 1)} disabled={atStart}>
          Previous
        </button>
        <span className="cs-pagination__page">
          Page {page.page} of {page.pageCount}
        </span>
        <button type="button" className="cs-btn cs-btn--ghost cs-btn--next" onClick={() => onPageChange(page.page + 1)} disabled={atEnd}>
          Next
        </button>
      </div>
    </footer>
  )
}

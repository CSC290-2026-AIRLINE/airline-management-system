import type { ReactNode } from 'react'

interface FilterBarProps {
  /** What the user typed in the search field. */
  search: string
  onSearchChange: (value: string) => void
  /** Placeholder of the search field, which is also its accessible name. */
  searchPlaceholder: string
  /** Puts every filter back to the one the design starts with. */
  onClear: () => void
  /** The dropdowns between the search field and the clear button. */
  children: ReactNode
  /** Shown after the clear button — the status pill. */
  after?: ReactNode
}

/** The filter row above the Session History and All Q&A tables. */
export function FilterBar({ search, onSearchChange, searchPlaceholder, onClear, children, after }: FilterBarProps) {
  return (
    <div className="ra-filters">
      <input
        type="text"
        className="ra-filterInput"
        value={search}
        placeholder={searchPlaceholder}
        aria-label={searchPlaceholder}
        onChange={(event) => onSearchChange(event.target.value)}
      />
      {children}
      <button type="button" className="ra-filterClear" onClick={onClear}>
        Clear
      </button>
      {after}
    </div>
  )
}

import { formatCount } from '../format'

interface PaginationProps {
  /** First row on screen, counted from one. Zero when the list is empty. */
  from: number
  /** Last row on screen. */
  to: number
  /** How many rows match the query, not just the ones on screen. */
  total: number
  /** What the rows are — "sessions" or "questions". */
  noun: string
  canGoBack: boolean
  canGoForward: boolean
  onBack: () => void
  onNext: () => void
}

/** The row under a table: how many rows are on screen, and the buttons that walk the pages. */
export function Pagination({ from, to, total, noun, canGoBack, canGoForward, onBack, onNext }: PaginationProps) {
  return (
    <div className="ra-pagination">
      <p className="ra-paginationLabel">
        {from > 0 ? `Showing ${from}–${to} of ${formatCount(total)} ${noun}` : `No ${noun} match these filters`}
      </p>
      <div className="ra-paginationButtons">
        <button type="button" className="ra-paginationButton" disabled={!canGoBack} onClick={onBack}>
          ← Previous
        </button>
        <button type="button" className="ra-paginationButton" disabled={!canGoForward} onClick={onNext}>
          Next →
        </button>
      </div>
    </div>
  )
}

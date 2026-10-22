import { useState, useSyncExternalStore } from 'react'
import type { WatchlistEntry } from '../watchlist.types'
import { WatchlistTable } from './WatchlistTable'

const mobileQuery = '(max-width: 767px)'
function subscribeToViewport(onChange: () => void) {
  const media = window.matchMedia(mobileQuery)
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}

export function WatchlistResults({ entries, onEdit }: { entries: WatchlistEntry[]; onEdit: (entry: WatchlistEntry) => void }) {
  const isMobile = useSyncExternalStore(
    subscribeToViewport,
    () => window.matchMedia(mobileQuery).matches,
    () => false,
  )
  const [requestedPage, setRequestedPage] = useState(1)
  const pageCount = Math.max(1, Math.ceil(entries.length / 3))
  const page = Math.min(requestedPage, pageCount)
  const start = (page - 1) * 3
  return (
    <>
      <WatchlistTable entries={isMobile ? entries.slice(start, start + 3) : entries} onEdit={onEdit} />
      {isMobile && pageCount > 1 && (
        <nav className="wl-pagination" aria-label="Watchlist pages">
          <button disabled={page === 1} onClick={() => setRequestedPage(page - 1)}>
            Previous
          </button>
          <span aria-live="polite">
            {start + 1}–{Math.min(start + 3, entries.length)} of {entries.length}
          </span>
          <button disabled={page === pageCount} onClick={() => setRequestedPage(page + 1)}>
            Next
          </button>
        </nav>
      )}
    </>
  )
}

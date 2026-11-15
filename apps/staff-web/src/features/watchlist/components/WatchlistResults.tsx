import type { WatchlistEntry } from '../watchlist.types'
import { WatchlistTable } from './WatchlistTable'

export function WatchlistResults({ entries, onEdit }: { entries: WatchlistEntry[]; onEdit: (entry: WatchlistEntry) => void }) {
  return <WatchlistTable entries={entries} onEdit={onEdit} />
}

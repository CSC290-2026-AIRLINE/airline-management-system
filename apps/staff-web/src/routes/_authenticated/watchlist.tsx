import { createFileRoute } from '@tanstack/react-router'
import WatchlistPage from '@staff-web/features/watchlist/WatchlistPage'

export const Route = createFileRoute('/_authenticated/watchlist')({
  component: WatchlistPage,
})

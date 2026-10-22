import { useAppAuth } from '@staff-web/auth/AuthProvider'
import { WatchlistView } from './WatchlistView'

export default function WatchlistPage() {
  const { logout } = useAppAuth()
  return <WatchlistView onSignOut={logout} />
}

import { useAppAuth } from '@staff-web/auth/AuthProvider'
import { WatchlistView } from '../WatchlistView'

export default function WatchlistPage() {
  const { logout, isLoading, accessToken } = useAppAuth()
  if (isLoading) return <p role="status">Loading your session…</p>
  if (!accessToken) return <p role="alert">Could not start your session. Please reload or sign in again.</p>
  return <WatchlistView onSignOut={logout} />
}

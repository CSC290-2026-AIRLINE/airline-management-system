import { createFileRoute } from '@tanstack/react-router'
import { ScreeningQueue } from '@staff-web/features/security-screening/ScreeningQueue'
import { useAppAuth } from '@staff-web/auth/AuthProvider'
import { validateQueueSearch } from '@staff-web/features/security-screening/queue-search'

export const Route = createFileRoute('/_authenticated/screening-queue')({
  validateSearch: validateQueueSearch,
  component: ScreeningQueueRoute,
})

function ScreeningQueueRoute() {
  const { logout } = useAppAuth()
  return <ScreeningQueue onSignOut={logout} />
}

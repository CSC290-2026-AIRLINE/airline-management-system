import { createFileRoute } from '@tanstack/react-router'
import { NoAccessScreen } from '@staff-web/features/admin-console/components/NoAccessScreen'
import { useScreenAccess } from '@staff-web/features/admin-console/hooks/useScreenAccess'
import { useHttpStaffApi } from '../../../features/checkin-boarding/api/use-staff-api.ts'
import { GatePage } from '../../../features/checkin-boarding/components/GatePage.tsx'
import { PageError } from '../../../features/checkin-boarding/components/PageError.tsx'

/** The tab and the airport of the gate screen live in the URL, so a link can open the gates of one airport. */
export const Route = createFileRoute('/_authenticated/check-in/gate')({
  validateSearch: (search: Record<string, unknown>): { tab?: 'manage'; airport?: string } => ({
    ...(search.tab === 'manage' ? { tab: 'manage' as const } : {}),
    ...(typeof search.airport === 'string' && /^[A-Z]{3}$/.test(search.airport) ? { airport: search.airport } : {}),
  }),
  component: GateRoute,
  errorComponent: PageError,
})

function GateRoute() {
  const api = useHttpStaffApi()
  const { tab = 'boarding', airport } = Route.useSearch()
  const navigate = Route.useNavigate()
  const { loading, canOpen } = useScreenAccess()

  if (loading) return <p className="p-6 text-sm text-muted-foreground">Checking your access…</p>
  if (!canOpen('f06.gate')) return <NoAccessScreen screenName="Gate" />

  return (
    <GatePage
      api={api}
      tab={tab}
      airport={airport}
      onSearch={(next) => void navigate({ search: (previous) => ({ ...previous, ...next }) })}
    />
  )
}

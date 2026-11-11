import { CONNECTED } from '../connected'
import type { Fetcher } from './usePagedList'
import { useResource } from './useResource'

interface PartnerRow {
  code: string
  name: string
  routes: { origin: string; destination: string }[]
}

// The active partner airlines from GET /partner-airlines, each with the routes it flies (partner_airline_route). partnersFor gives the
// codes of those that fly origin to destination, which is what cancel with rebook_partner accepts.
export function usePartners(fetcher: Fetcher) {
  const res = useResource<PartnerRow[]>(CONNECTED.partnerRoutes ? '/partner-airlines' : null, fetcher)
  const partnersFor = (origin: string, destination: string) =>
    (res.data ?? []).filter((p) => p.routes.some((r) => r.origin === origin && r.destination === destination)).map((p) => p.code)
  return { partnersFor, loading: res.loading, error: res.error }
}

import type { RouteRow } from '../types'

// "BKK to CNX" with the airport codes bold and "to" light; `fallback` shows when the route is not in the loaded list.
export function RouteCodes({ route, fallback }: { route: RouteRow | undefined; fallback: string }) {
  if (!route) return <>{fallback}</>
  return (
    <>
      <b>{route.origin}</b> <span className="fs-to">to</span> <b>{route.destination}</b>
    </>
  )
}

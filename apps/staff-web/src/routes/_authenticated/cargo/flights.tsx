import { createFileRoute } from '@tanstack/react-router'
import { FlightCargoPage } from '@staff-web/features/cargo/FlightCargoPage'

export const Route = createFileRoute('/_authenticated/cargo/flights')({
  component: FlightCargoPage,
  validateSearch: (search: Record<string, unknown>): { route?: string; from?: string; to?: string; flight?: string } => ({
    route: typeof search.route === 'string' && search.route ? search.route : undefined,
    from: typeof search.from === 'string' && search.from ? search.from : undefined,
    to: typeof search.to === 'string' && search.to ? search.to : undefined,
    flight: typeof search.flight === 'string' && search.flight ? search.flight : undefined,
  }),
})

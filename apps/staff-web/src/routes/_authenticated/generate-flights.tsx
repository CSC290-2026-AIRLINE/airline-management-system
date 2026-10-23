import { createFileRoute } from '@tanstack/react-router'
import { GenerateFlightsPage } from '@staff-web/features/flight-scheduling/pages/GenerateFlightsPage'

export const Route = createFileRoute('/_authenticated/generate-flights')({
  // ?pattern=<id> pre-ticks that pattern, as the Patterns page's "Generate flights" button does.
  validateSearch: (search: Record<string, unknown>): { pattern?: string } =>
    typeof search.pattern === 'string' ? { pattern: search.pattern } : {},
  component: GenerateFlightsRoute,
})

function GenerateFlightsRoute() {
  const { pattern } = Route.useSearch()
  return <GenerateFlightsPage pattern={pattern} />
}

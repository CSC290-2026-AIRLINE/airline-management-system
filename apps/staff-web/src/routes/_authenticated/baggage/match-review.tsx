import { createFileRoute } from '@tanstack/react-router'
import { MatchReviewPage } from '@staff-web/features/baggage/pages/MatchReviewPage'

interface MatchReviewSearch {
  match?: string
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const Route = createFileRoute('/_authenticated/baggage/match-review')({
  validateSearch: (search: Record<string, unknown>): MatchReviewSearch => ({
    match: typeof search.match === 'string' && UUID.test(search.match) ? search.match : undefined,
  }),
  component: MatchReviewRoute,
})

function MatchReviewRoute() {
  const { match } = Route.useSearch()
  const navigate = Route.useNavigate()

  return <MatchReviewPage selectedId={match} onSelect={(id) => void navigate({ search: { match: id } })} />
}

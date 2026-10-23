import { createFileRoute } from '@tanstack/react-router'
import { SetupCrewPage } from '@staff-web/features/crew-rostering/setup-crew/setup-crew'

export const Route = createFileRoute('/_authenticated/setup-crew/$crewId')({
  component: RouteComponent,
})

function RouteComponent() {
  const { crewId } = Route.useParams()
  return <SetupCrewPage crewId={crewId} />
}

import { createFileRoute } from '@tanstack/react-router'
import { AircraftTypeDetailPage } from '@staff-web/features/aircraft-management/AircraftTypeDetailPage'

export const Route = createFileRoute('/_authenticated/aircraft-types/$typeId')({
  component: AircraftTypeDetailRoute,
})

function AircraftTypeDetailRoute() {
  const { typeId } = Route.useParams()
  return <AircraftTypeDetailPage typeId={typeId} />
}

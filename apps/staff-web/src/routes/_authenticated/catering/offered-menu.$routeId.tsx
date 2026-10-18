import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/catering/offered-menu/$routeId')({
  component: RouteDetailPlaceholder,
})

function RouteDetailPlaceholder() {
  const { routeId } = Route.useParams()

  return (
    <section>
      <h1>Route detail</h1>
      <p>Route id: {routeId}</p>
    </section>
  )
}

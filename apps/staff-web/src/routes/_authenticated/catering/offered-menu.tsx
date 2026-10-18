import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/catering/offered-menu')({
  component: OfferedMenuPlaceholder,
})

function OfferedMenuPlaceholder() {
  return (
    <section>
      <h1>Offered menu</h1>
    </section>
  )
}

import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/catering/orders')({
  component: OrdersPlaceholder,
})

function OrdersPlaceholder() {
  return (
    <section>
      <h1>Catering Orders</h1>
    </section>
  )
}

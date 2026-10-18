import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/catering/stock/receive')({
  component: ReceivePlaceholder,
})

function ReceivePlaceholder() {
  return (
    <section>
      <h1>Receive delivery</h1>
    </section>
  )
}

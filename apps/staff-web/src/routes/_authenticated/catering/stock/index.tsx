import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/catering/stock/')({
  component: StockPlaceholder,
})

function StockPlaceholder() {
  return (
    <section>
      <h1>Stock</h1>
    </section>
  )
}

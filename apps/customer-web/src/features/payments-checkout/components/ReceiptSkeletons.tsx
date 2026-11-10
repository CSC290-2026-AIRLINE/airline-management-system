import { Card, CardContent } from '@customer-web/components/ui/card'
import { Skeleton } from '@customer-web/components/ui/skeleton'

/** The receipts list while it loads — the table's shape, so the page does not jump when the rows arrive. */
export function ReceiptsSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-card" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading your receipts…</span>
      <div className="border-b border-line px-5 py-4">
        <Skeleton className="h-3 w-32" />
      </div>
      {[0, 1, 2, 3].map((row) => (
        <div key={row} className="flex items-center gap-4 border-b border-line px-5 py-4 last:border-b-0">
          <Skeleton className="h-3 w-36" />
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-28" />
          <Skeleton className="ml-auto h-3 w-16" />
        </div>
      ))}
    </div>
  )
}

/** The receipt detail while it loads. */
export function ReceiptDetailSkeleton() {
  return (
    <Card className="gap-4" aria-busy="true" aria-live="polite">
      <CardContent className="flex flex-col gap-3">
        <span className="sr-only">Loading the receipt…</span>
        <Skeleton className="h-3 w-48" />
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-24 w-full" />
      </CardContent>
    </Card>
  )
}

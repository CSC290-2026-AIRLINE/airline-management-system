import { Card, CardContent } from '@customer-web/components/ui/card'
import { Skeleton } from '@customer-web/components/ui/skeleton'

/** The receipts list while it loads — the table's shape, so the page does not jump when the rows arrive. */
export function ReceiptsSkeleton() {
  return (
    <Card aria-busy="true" aria-live="polite">
      <CardContent className="flex flex-col gap-4">
        <span className="sr-only">Loading your receipts…</span>
        {[0, 1, 2, 3].map((row) => (
          <Skeleton key={row} className="h-5 w-full" />
        ))}
      </CardContent>
    </Card>
  )
}

/** The receipt detail while it loads. */
export function ReceiptDetailSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading the receipt…</span>
      <Skeleton className="h-4 w-48" />
      <Skeleton className="h-7 w-56" />
      <Skeleton className="h-24 w-full" />
    </div>
  )
}

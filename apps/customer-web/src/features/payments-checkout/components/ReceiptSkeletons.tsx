import { Card, CardContent } from '@customer-web/components/ui/card'
import { Skeleton } from '@customer-web/components/ui/skeleton'

/** The receipts list while it loads. */
export function ReceiptsSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading your receipts…</span>
      {[0, 1, 2].map((i) => (
        <Card key={i} className="gap-3 py-4">
          <CardContent className="flex flex-col gap-2.5">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-4 w-64" />
            <Skeleton className="h-3 w-52" />
          </CardContent>
        </Card>
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

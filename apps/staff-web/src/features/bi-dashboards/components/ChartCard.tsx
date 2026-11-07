import { Alert, AlertDescription } from '@staff-web/components/ui/alert'
import { Skeleton } from '@staff-web/components/ui/skeleton'
import type { BiChartName, BiFilters } from '../api/bi'
import { useChartImage } from '../hooks/useChartImage'

interface ChartCardProps {
  name: BiChartName
  filters: BiFilters
  label: string
}

/**
 * Shows one server-drawn chart. The SVG carries its own title and subtitle, so this card only handles the loading and
 * error states around it.
 */
export function ChartCard({ name, filters, label }: ChartCardProps) {
  const { url, loading, error } = useChartImage(name, filters)

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Could not load the {label.toLowerCase()} chart ({error}).
        </AlertDescription>
      </Alert>
    )
  }
  if (loading || url === null) {
    return <Skeleton className="h-[340px] w-full rounded-xl" aria-label={`Loading ${label.toLowerCase()} chart`} />
  }
  return <img src={url} alt={label} className="block h-auto w-full max-w-[720px]" />
}

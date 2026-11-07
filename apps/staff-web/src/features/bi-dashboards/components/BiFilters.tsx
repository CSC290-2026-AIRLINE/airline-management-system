import { Input } from '@staff-web/components/ui/input'
import { Label } from '@staff-web/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@staff-web/components/ui/select'
import type { BiFilters as Filters, BiGroup, BiRevenueMode, BiRouteRow } from '../api/bi'

const ALL_ROUTES = 'all'

const GROUPS: { value: BiGroup; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
]

const REVENUE_MODES: { value: BiRevenueMode; label: string }[] = [
  { value: 'after_refunds', label: 'After refunds' },
  { value: 'before_refunds', label: 'Before refunds' },
]

interface BiFiltersProps {
  filters: Filters
  routes: BiRouteRow[]
  onChange: (next: Filters) => void
}

export function BiFilters({ filters, routes, onChange }: BiFiltersProps) {
  return (
    <div className="print:hidden flex flex-wrap items-end gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="bi-from">From</Label>
        <Input id="bi-from" type="date" value={filters.from} onChange={(e) => onChange({ ...filters, from: e.target.value })} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="bi-to">To</Label>
        <Input id="bi-to" type="date" value={filters.to} onChange={(e) => onChange({ ...filters, to: e.target.value })} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="bi-route">Route</Label>
        <Select
          value={filters.routeId || ALL_ROUTES}
          onValueChange={(value) => onChange({ ...filters, routeId: value === ALL_ROUTES ? '' : value })}
        >
          <SelectTrigger id="bi-route" className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_ROUTES}>All routes</SelectItem>
            {routes.map((route) => (
              <SelectItem key={route.route_id} value={route.route_id}>
                {`${route.origin} – ${route.destination}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="bi-group">Group by</Label>
        <Select value={filters.group} onValueChange={(value) => onChange({ ...filters, group: value as BiGroup })}>
          <SelectTrigger id="bi-group" className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {GROUPS.map((g) => (
              <SelectItem key={g.value} value={g.value}>
                {g.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="bi-revenue">Revenue</Label>
        <Select value={filters.revenueMode} onValueChange={(value) => onChange({ ...filters, revenueMode: value as BiRevenueMode })}>
          <SelectTrigger id="bi-revenue" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {REVENUE_MODES.map((m) => (
              <SelectItem key={m.value} value={m.value}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

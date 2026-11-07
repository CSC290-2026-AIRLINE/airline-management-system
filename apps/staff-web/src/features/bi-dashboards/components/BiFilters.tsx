import { Input } from '@staff-web/components/ui/input'
import { Label } from '@staff-web/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@staff-web/components/ui/select'
import type { BiFilters as Filters, BiRouteRow } from '../api/bi'

const ALL_ROUTES = 'all'

interface BiFiltersProps {
  filters: Filters
  routes: BiRouteRow[]
  onChange: (next: Filters) => void
}

export function BiFilters({ filters, routes, onChange }: BiFiltersProps) {
  return (
    <div className="flex flex-wrap items-end gap-4">
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
    </div>
  )
}

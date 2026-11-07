import { ChevronDown, Download, Printer } from 'lucide-react'
import { Button } from '@staff-web/components/ui/button'
import { Card, CardContent } from '@staff-web/components/ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@staff-web/components/ui/dropdown-menu'
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
  onExportCsv: () => void
  onPrint: () => void
}

/**
 * The filter bar for the Operations page: route, dates, grouping and revenue mode on the left, and the export menu on
 * the right. Every control updates the page at once, so the figures, the charts and the tables always agree.
 */
export function BiFilters({ filters, routes, onChange, onExportCsv, onPrint }: BiFiltersProps) {
  return (
    <Card className="print:hidden">
      <CardContent className="flex flex-wrap items-end gap-x-4 gap-y-3 py-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bi-route">Route</Label>
          <Select
            value={filters.routeId || ALL_ROUTES}
            onValueChange={(value) => onChange({ ...filters, routeId: value === ALL_ROUTES ? '' : value })}
          >
            <SelectTrigger id="bi-route" className="w-52">
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
          <Label htmlFor="bi-from">From</Label>
          <Input
            id="bi-from"
            type="date"
            className="w-40"
            value={filters.from}
            onChange={(e) => onChange({ ...filters, from: e.target.value })}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bi-to">To</Label>
          <Input
            id="bi-to"
            type="date"
            className="w-40"
            value={filters.to}
            onChange={(e) => onChange({ ...filters, to: e.target.value })}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <span id="bi-group-label" className="text-sm leading-none font-medium select-none">
            Group by
          </span>
          <div role="group" aria-labelledby="bi-group-label" className="inline-flex h-9 rounded-md bg-muted p-1">
            {GROUPS.map((g) => {
              const active = filters.group === g.value
              return (
                <button
                  key={g.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onChange({ ...filters, group: g.value })}
                  className={`rounded-sm px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring ${
                    active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {g.label}
                </button>
              )
            })}
          </div>
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

        <div className="ml-auto flex flex-col gap-1.5">
          <span className="text-sm leading-none font-medium select-none invisible" aria-hidden="true">
            Export
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline">
                Export
                <ChevronDown aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onExportCsv}>
                <Download aria-hidden="true" />
                Export CSV
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onPrint}>
                <Printer aria-hidden="true" />
                Print PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardContent>
    </Card>
  )
}

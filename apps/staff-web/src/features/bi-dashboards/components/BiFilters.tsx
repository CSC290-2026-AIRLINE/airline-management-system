import { Download, Printer } from 'lucide-react'
import { Button } from '@staff-web/components/ui/button'
import { Card, CardContent } from '@staff-web/components/ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@staff-web/components/ui/dropdown-menu'
import { Input } from '@staff-web/components/ui/input'
import { Label } from '@staff-web/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@staff-web/components/ui/select'
import type { BiFilters as Filters, BiGroup, BiRouteRow } from '../api/bi'

function DateField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (value: string) => void }) {
  const readable = value
    ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
        .format(new Date(`${value}T00:00:00Z`))
        .replace('Sept', 'Sep')
    : 'Any date'
  return (
    <div className="bi-field">
      <Label htmlFor={id}>{label}</Label>
      <div className="bi-date-input">
        <Input id={id} type="date" value={value} onChange={(event) => onChange(event.target.value)} />
        <span aria-hidden="true">{readable}</span>
      </div>
    </div>
  )
}

/** The CSV item is left out for panels that have no CSV export; print is always offered. */
export function BiExportMenu({
  onExportCsv,
  onPrint,
  disabled = false,
}: {
  onExportCsv?: () => void
  onPrint: () => void
  disabled?: boolean
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" className="bi-button" disabled={disabled}>
          Export <span aria-hidden="true">▾</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {onExportCsv && (
          <DropdownMenuItem onSelect={onExportCsv}>
            <Download />
            Export CSV
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={onPrint}>
          <Printer />
          Print PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function BiFilters({
  filters,
  routes,
  onChange,
  onExportCsv,
  onPrint,
  showRoute = true,
  note,
  onApply,
}: {
  filters: Filters
  routes: BiRouteRow[]
  onChange: (next: Filters) => void
  onExportCsv?: () => void
  onPrint: () => void
  /** Pages whose figures are not split by route (the aircraft page) hide the route list and show `note` instead. */
  showRoute?: boolean
  note?: string
  /** When given, the filter values are a draft until Apply is clicked; the page loads them only then. */
  onApply?: () => void
}) {
  return (
    <Card className="bi-filter-card print:hidden">
      <CardContent>
        <div className="bi-filter-fields">
          {showRoute && (
            <div className="bi-field bi-route-field">
              <Label htmlFor="bi-route">Route</Label>
              <Select
                value={filters.routeId || 'all'}
                onValueChange={(value) => onChange({ ...filters, routeId: value === 'all' ? '' : value })}
              >
                <SelectTrigger id="bi-route">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All routes</SelectItem>
                  {routes.map((route) => (
                    <SelectItem key={route.route_id} value={route.route_id}>
                      {route.origin} – {route.destination}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <DateField id="bi-from" label="From" value={filters.from} onChange={(from) => onChange({ ...filters, from })} />
          <DateField id="bi-to" label="To" value={filters.to} onChange={(to) => onChange({ ...filters, to })} />
          <div className="bi-field">
            <span id="bi-group-label">Group by</span>
            <div role="group" aria-labelledby="bi-group-label" className="bi-segmented">
              {(['day', 'week', 'month'] as BiGroup[]).map((group) => (
                <button key={group} type="button" aria-pressed={filters.group === group} onClick={() => onChange({ ...filters, group })}>
                  {group[0].toUpperCase() + group.slice(1)}
                </button>
              ))}
            </div>
          </div>
          {note && <span className="bi-filter-note">{note}</span>}
        </div>
        {onApply && (
          <Button type="button" className="bi-button bi-apply" onClick={onApply}>
            Apply
          </Button>
        )}
        <BiExportMenu onExportCsv={onExportCsv} onPrint={onPrint} />
      </CardContent>
    </Card>
  )
}

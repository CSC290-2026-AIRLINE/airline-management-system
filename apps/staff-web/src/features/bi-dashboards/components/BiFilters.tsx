import type { ReactNode } from 'react'
import { ChevronDown, Download, Printer } from 'lucide-react'
import { Button } from '@staff-web/components/ui/button'
import { Card } from '@staff-web/components/ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@staff-web/components/ui/dropdown-menu'
import { Input } from '@staff-web/components/ui/input'
import { Label } from '@staff-web/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@staff-web/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@staff-web/components/ui/toggle-group'
import type { BiFilters as Filters, BiGroup, BiRouteRow } from '../api/bi'

const GROUPS: BiGroup[] = ['day', 'week', 'month']

/**
 * A caption above its control. Every filter caption goes through here so they all line up: `htmlFor` ties it to a
 * single control, `id` lets a group (the Group by toggle) name itself with aria-labelledby. Full width on a phone.
 */
export function FilterField({ label, htmlFor, id, children }: { label: string; htmlFor?: string; id?: string; children: ReactNode }) {
  return (
    <div className="flex w-full flex-col gap-1.5 sm:w-auto">
      <Label htmlFor={htmlFor} id={id} className="text-xs font-normal text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  )
}

/**
 * A native date input that shows the date as "01 Oct 2026" until it is focused. The native picker stays, so keyboard
 * entry and the browser's calendar both work.
 */
function DateField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (value: string) => void }) {
  const readable = value
    ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
        .format(new Date(`${value}T00:00:00Z`))
        .replace('Sept', 'Sep')
    : 'Any date'
  return (
    <FilterField label={label} htmlFor={id}>
      <div className="group relative w-full sm:w-36">
        <Input
          id={id}
          type="date"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="text-transparent group-focus-within:text-foreground [&::-webkit-calendar-picker-indicator]:opacity-0 group-focus-within:[&::-webkit-calendar-picker-indicator]:opacity-100 [&::-webkit-datetime-edit]:opacity-0 group-focus-within:[&::-webkit-datetime-edit]:opacity-100"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex items-center px-3 text-sm group-focus-within:invisible"
        >
          {readable}
        </span>
      </div>
    </FilterField>
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
        <Button type="button" variant="outline" disabled={disabled}>
          Export <ChevronDown aria-hidden="true" />
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

/** The filter card: fields on the left, Apply and Export on the right. It wraps, then stacks on a phone. */
export function BiFilterCard({ fields, actions }: { fields: ReactNode; actions: ReactNode }) {
  return (
    <Card className="flex-col gap-4 px-5 py-4 shadow-none sm:flex-row sm:flex-wrap sm:items-end sm:justify-between print:hidden">
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">{fields}</div>
      <div className="flex flex-wrap items-center gap-2">{actions}</div>
    </Card>
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
    <BiFilterCard
      fields={
        <>
          {showRoute && (
            <FilterField label="Route" htmlFor="bi-route">
              <Select
                value={filters.routeId || 'all'}
                onValueChange={(value) => onChange({ ...filters, routeId: value === 'all' ? '' : value })}
              >
                <SelectTrigger id="bi-route" className="w-full sm:w-40">
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
            </FilterField>
          )}
          <DateField id="bi-from" label="From" value={filters.from} onChange={(from) => onChange({ ...filters, from })} />
          <DateField id="bi-to" label="To" value={filters.to} onChange={(to) => onChange({ ...filters, to })} />
          <FilterField label="Group by" id="bi-group-label">
            <ToggleGroup
              type="single"
              variant="outline"
              aria-labelledby="bi-group-label"
              value={filters.group}
              onValueChange={(group) => group && onChange({ ...filters, group: group as BiGroup })}
            >
              {GROUPS.map((group) => (
                <ToggleGroupItem
                  key={group}
                  value={group}
                  className="px-3.5 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                >
                  {group[0].toUpperCase() + group.slice(1)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </FilterField>
          {note && (
            <span className="self-start rounded-md border border-dashed px-2.5 py-2 text-xs text-muted-foreground sm:self-end">{note}</span>
          )}
        </>
      }
      actions={
        <>
          {onApply && (
            <Button type="button" onClick={onApply}>
              Apply
            </Button>
          )}
          <BiExportMenu onExportCsv={onExportCsv} onPrint={onPrint} />
        </>
      }
    />
  )
}

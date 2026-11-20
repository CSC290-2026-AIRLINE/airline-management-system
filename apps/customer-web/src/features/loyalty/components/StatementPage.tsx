import { CalendarDays } from 'lucide-react'
import { Card } from '@customer-web/components/ui/card'
import { Input } from '@customer-web/components/ui/input'
import { Label } from '@customer-web/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@customer-web/components/ui/table'
import { ToggleGroup, ToggleGroupItem } from '@customer-web/components/ui/toggle-group'
import type { MemberSummary, StatementRow } from '../api/types'
import { formatMiles, formatSignedMiles, formatTableDate, minusMonths, toDateInput } from '../format'
import { EmptyState, SearchFlightsLink, SignedMiles, TypePill } from './parts'
import { STATEMENT_TYPES, type StatementSearch } from '../statement-search'
import { cx, TYPE_LABEL } from './ui'

// Filter chips: rounded, light blue when on.
const CHIP =
  'h-8 rounded-full! border-l! px-3.5 text-[13px] data-[state=on]:border-[#b9c8e4] data-[state=on]:bg-[#e8eef7] data-[state=on]:text-link'

function windowFor(search: StatementSearch, member: MemberSummary, rows: StatementRow[]) {
  const today = toDateInput(member.asOf)
  if (search.from || search.to) {
    return { from: search.from ?? toDateInput(member.joinedAt), to: search.to ?? today, preset: null }
  }
  if (search.range === '12m') return { from: toDateInput(minusMonths(member.asOf, 12)), to: today, preset: '12m' as const }
  const oldest = rows.length ? rows[rows.length - 1].occurredAt : member.joinedAt
  return { from: toDateInput(oldest), to: today, preset: 'all' as const }
}

// C05–C07 Statement: every ledger row with the balance after it, filtered by type and date range.
export function StatementPage({
  member,
  rows,
  search,
  onSearch,
}: {
  member: MemberSummary
  rows: StatementRow[]
  search: StatementSearch
  onSearch: (next: StatementSearch) => void
}) {
  const win = windowFor(search, member, rows)
  const shown = rows.filter((r) => {
    const day = toDateInput(r.occurredAt)
    return (!search.type || r.type === search.type) && day >= win.from && day <= win.to
  })
  const added = shown.filter((r) => r.miles > 0).reduce((sum, r) => sum + r.miles, 0)
  const removed = shown.filter((r) => r.miles < 0).reduce((sum, r) => sum + r.miles, 0)
  const keepWindow = { range: search.range, from: search.from, to: search.to }

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        <div className="col-span-2 flex flex-col gap-1 rounded-xl bg-navy p-5 text-white sm:col-span-1 sm:border sm:border-line sm:bg-white sm:p-4 sm:text-ink">
          <span className="text-[10px] font-semibold tracking-[0.06em] text-white/70 uppercase sm:text-muted">Balance now</span>
          <span className="text-[32px] leading-tight font-bold sm:text-xl">{formatMiles(member.milesBalance)}</span>
          <span className="text-xs text-white/70 sm:hidden">miles</span>
        </div>
        <Summary label="Added in this view" value={added === 0 ? '0' : formatSignedMiles(added)} tone="text-ok" />
        <Summary
          label="Spent or expired in this view"
          short="Spent or expired"
          value={removed === 0 ? '0' : formatSignedMiles(removed)}
          tone="text-danger"
        />
      </div>

      <Card className="gap-4 border-0 bg-transparent py-0 shadow-none sm:border sm:bg-white sm:p-5" aria-label="Statement">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <ToggleGroup
            type="single"
            variant="outline"
            spacing={2}
            aria-label="Type"
            className="flex-wrap"
            value={search.type ?? 'all'}
            onValueChange={(v) => v && onSearch(v === 'all' ? { ...keepWindow } : { ...keepWindow, type: v as StatementRow['type'] })}
          >
            <ToggleGroupItem value="all" className={CHIP}>
              All
            </ToggleGroupItem>
            {STATEMENT_TYPES.map((t) => (
              <ToggleGroupItem key={t} value={t} className={CHIP}>
                {TYPE_LABEL[t]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <ToggleGroup
            type="single"
            variant="outline"
            spacing={2}
            aria-label="Period"
            className="grid grid-cols-2 sm:flex"
            value={win.preset ?? ''}
            onValueChange={(v) => v && onSearch({ type: search.type, range: v as '12m' | 'all' })}
          >
            <ToggleGroupItem value="12m" className={CHIP}>
              Last 12 months
            </ToggleGroupItem>
            <ToggleGroupItem value="all" className={CHIP}>
              All time
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        <fieldset className="m-0 flex flex-wrap items-center gap-2 border-0 p-0 sm:gap-3">
          <legend className="sr-only">Date range</legend>
          <span className="hidden text-xs text-muted sm:inline">Date range</span>
          <DateField label="From" value={win.from} max={win.to} onChange={(from) => onSearch({ type: search.type, from, to: win.to })} />
          <span className="hidden text-muted sm:inline" aria-hidden="true">
            –
          </span>
          <DateField label="To" value={win.to} min={win.from} onChange={(to) => onSearch({ type: search.type, from: win.from, to })} />
        </fieldset>

        {shown.length === 0 ? (
          <EmptyState
            title="No transactions in this period"
            body={
              rows.length === 0
                ? 'Miles are added after you fly. Book a flight to start earning.'
                : 'Try another type or a wider date range.'
            }
            action={rows.length === 0 ? <SearchFlightsLink label="Book a flight" /> : undefined}
          />
        ) : (
          <>
            <StatementTable rows={shown} />
            <StatementCards rows={shown} />
          </>
        )}
      </Card>
      <p className="text-[11px] text-muted">
        Miles expire 36 months after the flight. Spending, adjustments and expiry never lower the miles that count toward your tier.
      </p>
    </>
  )
}

function Summary({ label, short, value, tone }: { label: string; short?: string; value: string; tone: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl bg-[#eef1f6] p-4 sm:border sm:border-line sm:bg-white">
      <span className="text-[10px] font-semibold tracking-[0.06em] text-muted uppercase">
        <span className="sm:hidden">{short ?? label}</span>
        <span className="hidden sm:inline">{label}</span>
      </span>
      <span className={cx('text-xl font-bold sm:text-ink', tone)}>{value}</span>
    </div>
  )
}

function DateField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string
  value: string
  min?: string
  max?: string
  onChange: (v: string) => void
}) {
  const id = `statement-${label.toLowerCase()}`
  return (
    <div className="flex flex-1 items-center gap-2 sm:flex-none">
      <Label htmlFor={id} className="text-xs font-normal text-muted">
        <CalendarDays size={14} className="hidden sm:block" aria-hidden="true" />
        {label}
      </Label>
      <Input
        id={id}
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        className="h-9 w-auto bg-white"
      />
    </div>
  )
}

function Description({ row }: { row: StatementRow }) {
  return (
    <>
      <div className="text-[13px] font-medium">{row.title}</div>
      <div className="text-[11px] text-muted">{row.detail}</div>
      {row.expiryNote && (
        <div className={cx('text-[11px]', row.expiringSoon ? 'font-semibold text-warn' : 'text-muted')}>{row.expiryNote}</div>
      )}
    </>
  )
}

function StatementTable({ rows }: { rows: StatementRow[] }) {
  return (
    <div className="hidden md:block">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Description</TableHead>
            <TableHead>Type</TableHead>
            <TableHead className="text-right">Miles</TableHead>
            <TableHead className="text-right">Balance</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.seq}>
              <TableCell className="text-[13px]">{formatTableDate(r.occurredAt)}</TableCell>
              <TableCell className="whitespace-normal">
                <Description row={r} />
              </TableCell>
              <TableCell>
                <TypePill type={r.type} />
              </TableCell>
              <TableCell className="text-right text-[13px]">
                <SignedMiles type={r.type} miles={r.miles} />
              </TableCell>
              <TableCell className="text-right text-[13px] tabular-nums">{formatMiles(r.balanceAfter)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

// C05 on a phone: one card per row.
function StatementCards({ rows }: { rows: StatementRow[] }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-3 p-0 md:hidden">
      {rows.map((r) => (
        <li key={r.seq} className="flex flex-col gap-2 rounded-xl border border-line bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-muted">{formatTableDate(r.occurredAt)}</span>
            <TypePill type={r.type} />
          </div>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Description row={r} />
            </div>
            <div className="flex flex-col items-end">
              <SignedMiles type={r.type} miles={r.miles} className="text-[15px]" />
              <span className="text-[11px] whitespace-nowrap text-muted">bal {formatMiles(r.balanceAfter)}</span>
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}

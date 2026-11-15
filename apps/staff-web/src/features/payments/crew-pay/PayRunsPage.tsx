import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { Button } from '@staff-web/components/ui/button'
import { Input } from '@staff-web/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@staff-web/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@staff-web/components/ui/table'
import { cn } from '@staff-web/lib/utils'
import { errorMessage } from '../api'
import { useLoad } from '../useLoad'
import { LoadErrorCard, LoadingCard } from '../components/common'
import { useCrewPayApi, type CrewRef, type PayRunStatus, type PayRunSummary } from './api'
import { CrewPayHeader } from './CrewPayHeader'
import { AdjustmentDialog, ApproveDialog, NewRunDialog, PayDialog } from './dialogs'
import { crewDisplayName, formatAmount, periodText, rankLabel, runLabel, shortDate } from './format'

const PAGE_SIZE = 10
type StatusFilter = 'all' | 'needs_action' | 'paid'
type SortKey = 'name' | 'payout_desc' | 'payout_asc'
type Notice = { tone: 'good' | 'bad'; text: string } | null

const card = 'rounded-xl border bg-card p-4 shadow-xs'

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-md border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none',
        active ? 'border-[#9db4d9] bg-[#e8eef9] text-foreground' : 'border-border bg-background text-foreground hover:bg-accent',
      )}
    >
      {children}
    </button>
  )
}

function StatusPill({ status }: { status: PayRunStatus }) {
  const styles: Record<PayRunStatus, [string, string]> = {
    draft: ['Draft', 'bg-[#e8eef9] text-[#1e3a8a]'],
    approved: ['Approved', 'bg-warning-soft text-warning'],
    paid: ['Paid', 'bg-success-soft text-success-strong'],
    cancelled: ['Cancelled', 'bg-secondary text-muted-foreground'],
  }
  const [label, cls] = styles[status]
  return <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-semibold', cls)}>{label}</span>
}

/**
 * Pay Runs (5C frames): the runs on the left, filtered by year and status; the selected run on the right with its
 * Draft → Approved → Paid steps, the actions, the totals and the crew payouts table.
 */
export function PayRunsPage({ selectedRunId }: { selectedRunId?: string }) {
  const api = useCrewPayApi()
  const navigate = useNavigate()
  const overview = useLoad(() => api.overview(), 'overview')
  const [year, setYear] = useState<string>('all')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [newRunOpen, setNewRunOpen] = useState(false)

  const currency = overview.data?.currency ?? 'USD'
  const runs = overview.data?.runs.filter((r) => r.status !== 'cancelled') ?? []
  const years = [...new Set(runs.map((r) => r.period_start.slice(0, 4)))].sort().reverse().slice(0, 3)
  const shown = runs.filter(
    (r) =>
      (year === 'all' || r.period_start.startsWith(year)) &&
      (status === 'all' || (status === 'paid' ? r.status === 'paid' : r.status === 'draft' || r.status === 'approved')),
  )
  const needsAction = shown.filter((r) => r.status === 'draft' || r.status === 'approved')
  const byYear = new Map<string, PayRunSummary[]>()
  for (const r of shown.filter((x) => x.status === 'paid')) {
    const y = r.period_start.slice(0, 4)
    byYear.set(y, [...(byYear.get(y) ?? []), r])
  }
  const selected = selectedRunId ?? needsAction[0]?.id ?? shown[0]?.id

  const select = (id: string) => void navigate({ to: '/payments/pay-runs/$runId', params: { runId: id } })

  const runCard = (r: PayRunSummary) => (
    <li key={r.id}>
      <button
        type="button"
        onClick={() => select(r.id)}
        className={cn(
          'w-full rounded-lg border bg-card px-3 py-2 text-left shadow-xs transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none',
          r.id === selected && 'border-2 border-[#475569] bg-[#f1f5f9]',
        )}
      >
        <span className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold">{runLabel(r.period_start, r.period_end)}</span>
          <StatusPill status={r.status} />
        </span>
        <span className="block text-xs text-muted-foreground">
          {r.crew_count} crew · {formatAmount(r.total)} {currency}
        </span>
      </button>
    </li>
  )

  return (
    <main className="mx-auto w-full max-w-6xl space-y-5 p-4 md:p-6">
      <CrewPayHeader viewer={overview.data?.viewer} title="Pay Runs" />

      {overview.loading && !overview.data && <LoadingCard />}
      {overview.error && <LoadErrorCard message={overview.error} onRetry={overview.reload} />}

      {overview.data && (
        <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
          <aside className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold tracking-wide text-muted-foreground">RUNS</p>
              <Button size="xs" variant="outline" onClick={() => setNewRunOpen(true)} disabled={overview.data.accrued.lines.length === 0}>
                <Plus /> New run
              </Button>
            </div>
            {overview.data.accrued.lines.length === 0 && (
              <p className="text-xs text-muted-foreground">All earned pay is already in a run, so there is nothing for a new run yet.</p>
            )}
            <div className="flex flex-wrap gap-1.5">
              <Chip active={year === 'all'} onClick={() => setYear('all')}>
                All years
              </Chip>
              {years.map((y) => (
                <Chip key={y} active={year === y} onClick={() => setYear(y)}>
                  {y}
                </Chip>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Chip active={status === 'all'} onClick={() => setStatus('all')}>
                All
              </Chip>
              <Chip active={status === 'needs_action'} onClick={() => setStatus('needs_action')}>
                Needs action
              </Chip>
              <Chip active={status === 'paid'} onClick={() => setStatus('paid')}>
                Paid
              </Chip>
            </div>

            {needsAction.length > 0 && (
              <section className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">Needs action</p>
                <ul className="space-y-2">{needsAction.map(runCard)}</ul>
              </section>
            )}
            {[...byYear].map(([y, list]) => (
              <section key={y} className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">
                  {y} · {list.length} {list.length === 1 ? 'run' : 'runs'}
                </p>
                <ul className="space-y-2">{list.map(runCard)}</ul>
              </section>
            ))}
            {shown.length === 0 && <p className="text-sm text-muted-foreground">No runs match.</p>}
          </aside>

          <section className="min-w-0">
            {selected ? (
              <RunDetail key={selected} runId={selected} crew={overview.data.crew} onChanged={overview.reload} />
            ) : (
              <div className={cn(card, 'py-10 text-center text-sm text-muted-foreground')}>No pay runs yet.</div>
            )}
          </section>
        </div>
      )}

      {overview.data && (
        <NewRunDialog
          key={overview.data.accrued.lines.map((l) => l.id).join()}
          accruedDates={overview.data.accrued.lines.map((l) => l.earned_on)}
          open={newRunOpen}
          onOpenChange={setNewRunOpen}
          onCreate={async (start, end) => {
            const run = await api.createRun(start, end)
            overview.reload()
            select(run.id)
          }}
        />
      )}
    </main>
  )
}

function Stepper({ status }: { status: PayRunStatus }) {
  const reached = status === 'paid' ? 3 : status === 'approved' ? 2 : 1
  const steps = ['Draft', 'Approved', 'Paid']
  return (
    <ol className="mt-3 flex items-center gap-2" aria-label="Run progress">
      {steps.map((label, i) => {
        const n = i + 1
        const done = n <= reached
        // The current step of a draft is an outlined circle; finished steps are filled.
        const current = n === reached && status === 'draft'
        return (
          <li
            key={label}
            className={cn('flex items-center gap-2', n < steps.length && 'flex-1')}
            aria-current={n === reached ? 'step' : undefined}
          >
            <span
              className={cn(
                'grid size-6 shrink-0 place-items-center rounded-full border text-xs font-semibold',
                current
                  ? 'border-[#0f172a] bg-background text-foreground'
                  : done
                    ? 'border-[#0f172a] bg-[#0f172a] text-white'
                    : 'border-border text-muted-foreground',
              )}
            >
              {n}
            </span>
            <span className={cn('text-xs', done ? 'font-semibold text-foreground' : 'text-muted-foreground')}>{label}</span>
            {n < steps.length && <span className={cn('h-px flex-1', n < reached ? 'bg-[#0f172a]' : 'bg-border')} aria-hidden="true" />}
          </li>
        )
      })}
    </ol>
  )
}

function RunDetail({ runId, crew, onChanged }: { runId: string; crew: CrewRef[]; onChanged: () => void }) {
  const api = useCrewPayApi()
  const run = useLoad(() => api.getRun(runId), runId)
  const [dialog, setDialog] = useState<'approve' | 'pay' | 'adjust' | null>(null)
  const [notice, setNotice] = useState<Notice>(null)
  const [search, setSearch] = useState('')
  const [rank, setRank] = useState<string>('all')
  const [sort, setSort] = useState<SortKey>('name')
  const [page, setPage] = useState(1)
  const [retrying, setRetrying] = useState<string | null>(null)

  if (run.error) return <LoadErrorCard message={run.error} onRetry={run.reload} />
  if (!run.data) return <LoadingCard />
  const r = run.data

  const refresh = () => {
    run.reload()
    onChanged()
  }
  const creator = r.created_by.name.split(' ')[0]
  const rows = r.crew.map((g) => ({
    crew: g.crew,
    name: crewDisplayName(g.crew),
    base: Number(g.totals.base ?? 0),
    overtime: Number(g.totals.overtime ?? 0),
    perDiem: Number(g.totals.per_diem ?? 0),
    adjustment: Number(g.totals.adjustment ?? 0),
    hasAdjustment: g.lines.some((l) => l.line_type === 'adjustment'),
    net: Number(g.net),
    payout: r.payout.find((p) => p.crew_id === g.crew.id),
  }))
  const overtimeTotal = rows.reduce((s, x) => s + x.overtime, 0)
  const adjustmentLines = r.crew.flatMap((g) => g.lines).filter((l) => l.line_type === 'adjustment')
  const adjustmentTotal = adjustmentLines.reduce((s, l) => s + Number(l.amount), 0)
  const ranks = (['captain', 'first_officer', 'cabin_crew', 'police'] as const)
    .map((role) => ({ role, count: rows.filter((x) => x.crew.role === role).length }))
    .filter((x) => x.count > 0)

  const needle = search.trim().toLowerCase()
  const filtered = rows
    .filter(
      (x) =>
        (rank === 'all' || x.crew.role === rank) &&
        (x.name.toLowerCase().includes(needle) || `${x.crew.first_name} ${x.crew.last_name}`.toLowerCase().includes(needle)),
    )
    .sort((a, b) => (sort === 'payout_desc' ? b.net - a.net : sort === 'payout_asc' ? a.net - b.net : a.name.localeCompare(b.name)))
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const current = Math.min(page, pages)
  const visible = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)

  function chooseRank(next: string) {
    setRank(next)
    setPage(1)
  }

  function exportCsv() {
    const quote = (v: string) => `"${v.replace(/"/g, '""')}"`
    const header = ['Crew member', 'Rank', 'Base', 'Overtime', 'Per diem', 'Adjustment', 'Payout']
    const body = filtered.map((x) =>
      [quote(x.name), quote(rankLabel(x.crew.role)), ...[x.base, x.overtime, x.perDiem, x.adjustment, x.net].map((v) => v.toFixed(2))].join(
        ',',
      ),
    )
    const url = URL.createObjectURL(new Blob([[header.join(','), ...body].join('\n')], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `pay-run-${r.period_start.slice(0, 7)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function retry(payoutId: string) {
    setRetrying(payoutId)
    try {
      const result = await api.retryPayout(payoutId)
      setNotice(
        result.status === 'paid'
          ? { tone: 'good', text: 'Payout sent.' }
          : { tone: 'bad', text: result.failure_reason ?? 'The payout failed again.' },
      )
      refresh()
    } catch (err) {
      setNotice({ tone: 'bad', text: errorMessage(err) })
    } finally {
      setRetrying(null)
    }
  }

  return (
    <div className="space-y-3">
      <div className={card}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="m-0 font-sans text-lg font-bold text-foreground">{runLabel(r.period_start, r.period_end)}</h2>
            <p className="text-xs text-muted-foreground">
              Created by {creator} · {r.approved_by ? `approved by ${r.approved_by.split(' ')[0]} · ` : ''}
              {r.paid_at ? `paid ${shortDate(r.paid_at)}` : periodText(r.period_start, r.period_end)}
            </p>
          </div>
          {r.status === 'approved' ? (
            <span className="rounded bg-warning-soft px-1.5 py-0.5 text-[11px] font-semibold text-warning">Approved · ready to pay</span>
          ) : (
            <StatusPill status={r.status} />
          )}
        </div>
        {r.status !== 'cancelled' && <Stepper status={r.status} />}
      </div>

      <div className={card}>
        <p className="mb-2 text-sm font-semibold">Actions</p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant={r.status === 'draft' && !r.is_creator ? 'default' : 'outline'}
            disabled={r.status !== 'draft' || r.is_creator}
            onClick={() => setDialog('approve')}
          >
            Approve run
          </Button>
          <Button
            variant={r.status === 'approved' ? 'default' : 'outline'}
            disabled={r.status !== 'approved'}
            onClick={() => setDialog('pay')}
          >
            Pay run
          </Button>
          <Button variant="outline" disabled={r.status !== 'draft'} onClick={() => setDialog('adjust')}>
            Add adjustment
          </Button>
        </div>
        {r.status === 'draft' && r.is_creator && !notice && (
          <p className="mt-3 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
            Blocked: {creator} created this run, so another finance user must approve it.
          </p>
        )}
        {notice && (
          <p
            className={cn(
              'mt-3 rounded-md px-3 py-2 text-sm',
              notice.tone === 'good' ? 'bg-success-soft text-success-strong' : 'bg-danger-soft text-danger',
            )}
            role={notice.tone === 'bad' ? 'alert' : 'status'}
          >
            {notice.text}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {(
          [
            ['TOTAL PAYOUT', formatAmount(r.total), r.currency],
            ['CREW', String(rows.length), 'in this run'],
            ['OVERTIME', formatAmount(overtimeTotal), r.currency],
            ['ADJUSTMENTS', formatAmount(adjustmentTotal), `${adjustmentLines.length} ${adjustmentLines.length === 1 ? 'line' : 'lines'}`],
          ] as const
        ).map(([label, value, sub]) => (
          <div key={label} className={card}>
            <p className="text-[10px] font-semibold tracking-wide text-muted-foreground">{label}</p>
            <p className="text-xl font-bold tabular-nums">{value}</p>
            <p className="text-xs text-muted-foreground">{sub}</p>
          </div>
        ))}
      </div>

      <div className={card}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold">Crew payouts</p>
          <div className="flex items-center gap-3">
            <Button size="sm" variant="outline" onClick={exportCsv} disabled={filtered.length === 0}>
              Export CSV
            </Button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <Input
            aria-label="Search crew name"
            placeholder="Search crew name"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            className="min-w-48 flex-1"
          />
          <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
            <SelectTrigger className="w-56" aria-label="Sort crew payouts">
              <span className="text-muted-foreground">Sort by</span>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">Name</SelectItem>
              <SelectItem value="payout_desc">Payout, high to low</SelectItem>
              <SelectItem value="payout_asc">Payout, low to high</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-semibold tracking-wide text-muted-foreground">RANK</span>
          <Chip active={rank === 'all'} onClick={() => chooseRank('all')}>
            All ranks · {rows.length}
          </Chip>
          {ranks.map((x) => (
            <Chip key={x.role} active={rank === x.role} onClick={() => chooseRank(x.role)}>
              {rankLabel(x.role)} · {x.count}
            </Chip>
          ))}
        </div>

        <Table className="mt-2">
          <TableHeader>
            <TableRow>
              <TableHead>Crew member</TableHead>
              <TableHead>Rank</TableHead>
              <TableHead className="text-right">Base</TableHead>
              <TableHead className="text-right">Overtime</TableHead>
              <TableHead className="text-right">Per diem</TableHead>
              <TableHead className="text-right">Adjustment</TableHead>
              <TableHead className="text-right">Payout</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((x) => {
              const flagged = x.hasAdjustment && r.status === 'draft'
              const failed = x.payout?.status === 'failed' ? x.payout : null
              return (
                <TableRow key={x.crew.id} className={cn(flagged && 'bg-[#fef9e7] hover:bg-[#fdf3cf]')}>
                  <TableCell className="font-semibold">{x.name}</TableCell>
                  <TableCell className="text-muted-foreground">{rankLabel(x.crew.role)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatAmount(x.base)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatAmount(x.overtime)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatAmount(x.perDiem)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatAmount(x.adjustment)}
                    {flagged && <span className="block text-[11px] font-medium text-warning">Needs override</span>}
                  </TableCell>
                  <TableCell className="text-right font-bold tabular-nums">
                    {formatAmount(x.net)}
                    {failed && (
                      <span className="mt-1 flex items-center justify-end gap-1.5">
                        <span
                          className="rounded bg-danger-soft px-1.5 py-0.5 text-[11px] font-semibold text-danger"
                          title={failed.failure_reason ?? undefined}
                        >
                          Payout failed
                        </span>
                        <Button size="xs" variant="outline" disabled={retrying !== null} onClick={() => void retry(failed.id)}>
                          {retrying === failed.id ? 'Retrying…' : 'Retry'}
                        </Button>
                      </span>
                    )}
                    {x.net <= 0 && r.status === 'paid' && (
                      <span className="block text-[11px] font-medium text-warning">Carried to next run</span>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
            {visible.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-6 text-center text-sm text-muted-foreground">
                  No crew match.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            Showing {filtered.length === 0 ? 0 : (current - 1) * PAGE_SIZE + 1}–{Math.min(current * PAGE_SIZE, filtered.length)} of{' '}
            {filtered.length} · {rows.length} crew in this run
          </span>
          <span className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={current <= 1} onClick={() => setPage(current - 1)}>
              Previous
            </Button>
            <span>
              Page {current} of {pages}
            </span>
            <Button size="sm" variant="outline" disabled={current >= pages} onClick={() => setPage(current + 1)}>
              Next
            </Button>
          </span>
        </div>
      </div>

      <ApproveDialog
        run={r}
        open={dialog === 'approve'}
        onOpenChange={(o) => setDialog(o ? 'approve' : null)}
        onApprove={async (reason) => {
          await api.approve(r.id, reason)
          setNotice({
            tone: 'good',
            text: r.needs_admin ? 'Approved. You can now pay the run.' : 'Approved. You can now pay the run.',
          })
          refresh()
        }}
      />
      <PayDialog
        run={r}
        open={dialog === 'pay'}
        onOpenChange={(o) => setDialog(o ? 'pay' : null)}
        onPay={async () => {
          await api.pay(r.id)
          const fresh = await api.getRun(r.id)
          const sent = fresh.payout.filter((p) => p.status === 'paid').length
          const failed = fresh.payout.filter((p) => p.status === 'failed').length
          setNotice(
            failed > 0
              ? {
                  tone: 'bad',
                  text: `Paid. ${sent} payouts were sent; ${failed} failed and can be retried below.`,
                }
              : { tone: 'good', text: `Paid. ${sent} payouts were sent.` },
          )
          refresh()
        }}
      />
      <AdjustmentDialog
        crew={crew.length > 0 ? crew : rows.map((x) => x.crew)}
        currency={r.currency}
        open={dialog === 'adjust'}
        onOpenChange={(o) => setDialog(o ? 'adjust' : null)}
        onAdd={async ({ crewId, amount, reason }) => {
          await api.addAdjustment({ crew_id: crewId, amount, description: reason, pay_run_id: r.id })
          setNotice({
            tone: 'good',
            text: `Adjustment of ${formatAmount(amount)} ${r.currency} added.`,
          })
          refresh()
        }}
      />
    </div>
  )
}

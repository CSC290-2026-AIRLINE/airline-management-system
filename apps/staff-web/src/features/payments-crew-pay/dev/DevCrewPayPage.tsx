import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useAppAuth } from '@staff-web/auth/AuthProvider'
import { Badge } from '@staff-web/components/ui/badge'
import { Button } from '@staff-web/components/ui/button'
import { ErrorAlert } from '../status-cards'

/*
 * TODO(F5-dev): DELETE THIS FOLDER (`features/payments-crew-pay/dev`) and `routes/_authenticated/dev/crew-pay.tsx`
 * before the PR merges. It is a development tool, not part of the product.
 */

interface DevCrewStatus {
  you_are_staff: boolean
  crew: { id: string; name: string; role: string; employee_number: string; linked_to_you: boolean }[]
  flights: number
  accrued_lines: number
  in_run_lines: number
  paid_lines: number
  runs: number
}

const TOOLS_OFF = 'The dev tools are off. Set PAYMENT_DEV_TOOLS="true" in apps/backend/.env and restart the backend.'
const card = 'rounded-xl border bg-card p-4 shadow-xs'

function useDevApi() {
  const { fetchWithAuth } = useAppAuth()

  async function json<T>(path: string, method: 'GET' | 'POST' | 'DELETE' = 'GET'): Promise<T> {
    const res = await fetchWithAuth(`/api/dev/crew-pay${path}`, { method })
    const text = await res.text()
    const body = text ? (JSON.parse(text) as { message?: string | string[] }) : null
    if (!res.ok) {
      if (res.status === 404) throw new Error(TOOLS_OFF)
      const message = Array.isArray(body?.message) ? body.message.join('. ') : body?.message
      throw new Error(message ?? `${res.status} ${res.statusText}`)
    }
    return body as T
  }

  return {
    status: () => json<DevCrewStatus>(''),
    seed: () =>
      json<{ pairing_code: string | null; from: string; to: string; crew: string[]; pairings_priced: number; linked_to: string | null }>(
        '/seed',
        'POST',
      ),
    draftRun: () => json<{ run_id: string; created_by: string; lines: number }>('/draft-run', 'POST'),
    remove: () => json<Record<string, number>>('', 'DELETE'),
  }
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className={card}>
      <p className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="text-xl font-bold tabular-nums">{value}</p>
    </div>
  )
}

function DevTools() {
  const api = useDevApi()
  const [status, setStatus] = useState<DevCrewStatus | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function run(label: string, work: () => Promise<string | void>) {
    setBusy(label)
    setError(null)
    setNotice(null)
    try {
      const message = await work()
      if (message) setNotice(message)
      setStatus(await api.status())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  useEffect(() => {
    let current = true
    api
      .status()
      .then((result) => {
        if (current) setStatus(result)
      })
      .catch((e: unknown) => {
        if (current) setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      current = false
    }
    // `api` is rebuilt every render, so it stays out of the dependency list; this runs once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const hasData = (status?.crew.length ?? 0) > 0

  return (
    <div className="space-y-5">
      <div className={card}>
        <p className="text-sm font-semibold">Development tool: a stand-in for Feature 8</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Pay Runs and My Pay need crew who have flown. Until Feature 8 has them, this adds three sample crew and one worked pairing (four
          flights, already arrived), prices it straight away, and links one sample crew member (Mali Thongdee, cabin crew) to your sign-in
          so My Pay shows their pay. It writes into other teams&apos; tables (crew, flights, pairings, rosters) and takes them out again
          with &quot;Remove&quot;.
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Pricing and paying also write finance ledger rows. That table is append-only, so those stay even after &quot;Remove&quot;. Use a
          development database.
        </p>
        <p className="mt-2 text-xs text-muted-foreground">TODO(F5-dev): delete this page before the PR merges.</p>
      </div>

      {error && <ErrorAlert message={error} />}
      {notice && (
        <p role="status" className="m-0 rounded-md bg-success-soft px-3 py-2 text-sm text-success-strong">
          {notice}
        </p>
      )}

      {status && !status.you_are_staff && <ErrorAlert message="Sign in as a staff member to use the crew pay test tools." />}

      <div className={card}>
        <p className="mb-2 text-sm font-semibold">Steps</p>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={busy !== null || !status?.you_are_staff}
            onClick={() =>
              void run('seed', async () => {
                const done = await api.seed()
                return `Added pairing ${done.pairing_code ?? ''} (${done.from} to ${done.to}) for ${done.crew.length} crew, priced. Linked to ${done.linked_to ?? 'nobody'}.`
              })
            }
          >
            {busy === 'seed' ? 'Adding…' : '1. Add sample crew work'}
          </Button>
          <Button
            variant="outline"
            disabled={busy !== null || !status || status.accrued_lines === 0}
            onClick={() =>
              void run('draft', async () => {
                const done = await api.draftRun()
                return `Draft run made by ${done.created_by} with ${done.lines} line(s). Approve and pay it in Pay Runs as yourself.`
              })
            }
          >
            2. Create a draft pay run
          </Button>
          <Button asChild variant="outline">
            <Link to="/payments/pay-runs">3. Open Pay Runs</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/payments/my-pay">4. Open My Pay</Link>
          </Button>
          <Button
            variant="destructive"
            disabled={busy !== null || !hasData}
            onClick={() => {
              if (!window.confirm('Remove all sample crew data, their pay and payouts?')) return
              void run('remove', async () => {
                const done = await api.remove()
                return `Removed: ${Object.entries(done)
                  .map(([name, count]) => `${count} ${name.replace(/_/g, ' ')}`)
                  .join(', ')}.`
              })
            }}
          >
            Remove all sample data
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          When you pay the run, Ploy Chaiyo (first officer) has no payout contact on purpose, so her payout fails. That shows the
          failed-payout path; Retry fails again until an email is added to her crew record.
        </p>
      </div>

      {status && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Stat label="Flights" value={status.flights} />
            <Stat label="Accrued lines" value={status.accrued_lines} />
            <Stat label="In a run" value={status.in_run_lines} />
            <Stat label="Paid lines" value={status.paid_lines} />
            <Stat label="Runs" value={status.runs} />
          </div>

          <div className={card}>
            <p className="mb-2 text-sm font-semibold">Sample crew</p>
            {status.crew.length === 0 ? (
              <p className="text-sm text-muted-foreground">None yet. Press &quot;Add sample crew work&quot;.</p>
            ) : (
              <ul className="divide-y text-sm">
                {status.crew.map((member) => (
                  <li key={member.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>
                      <span className="font-semibold">{member.name}</span>{' '}
                      <span className="text-muted-foreground">
                        · {member.role.replace(/_/g, ' ')} · {member.employee_number}
                      </span>
                    </span>
                    {member.linked_to_you && <Badge className="border-0 bg-[#EAF0FB] text-[#1E3A8A]">linked to your sign-in</Badge>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  )
}

/** `/dev/crew-pay`: a development tool to try Pay Runs and My Pay before Feature 8 exists. Only while running `npm run dev`. */
export function DevCrewPayPage() {
  return (
    <main className="mx-auto w-full max-w-6xl space-y-5 px-4 py-6 md:px-8">
      <header>
        <h1 className="m-0 font-sans text-2xl font-semibold text-foreground">Crew pay test tools</h1>
        <p className="mt-1 mb-0 max-w-3xl text-sm text-muted-foreground">Sample crew work for Pay Runs and My Pay (development only).</p>
      </header>
      {import.meta.env.DEV ? (
        <DevTools />
      ) : (
        <p className="text-sm text-muted-foreground">The crew pay test tools are only available when the app runs in development.</p>
      )}
    </main>
  )
}

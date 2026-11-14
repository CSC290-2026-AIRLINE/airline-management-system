import { CheckCircle2 } from 'lucide-react'
import { Alert, AlertDescription } from '@staff-web/components/ui/alert'
import { Button } from '@staff-web/components/ui/button'
import { Skeleton } from '@staff-web/components/ui/skeleton'
import { PageSelect } from './components/PageSelect'
import { Component, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useAppAuth } from '@staff-web/auth/AuthProvider'
import type { ReviewDraft } from './types'
import { latestReview } from './screening-model'
import { sortLabels, sortValues, statusFilters } from './queue-search'
import { mapCounts, mapDetail, mapQueueItem, postReview, ScreeningApiError } from './screening-api'
import type { ApiDetail, ApiQueue } from './screening-api'
import { useScreeningRead } from './use-screening-api'
import { QueueToolbar } from './components/QueueToolbar'
import { QueueList } from './components/QueueList'
import { ScreeningShell } from './components/ScreeningShell'
import { ScreeningReview } from './components/ScreeningReview'

class ScreeningBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? (
      <div className="flex flex-col items-center gap-2 py-16 text-center">
        <h2 className="m-0 font-sans text-base font-semibold text-foreground">Screening queue could not be displayed</h2>
        <Button onClick={() => window.location.reload()}>Reload</Button>
      </div>
    ) : (
      this.props.children
    )
  }
}
export function ScreeningQueue() {
  return (
    <ScreeningBoundary>
      <QueueContent />
    </ScreeningBoundary>
  )
}
function RequestState({ loading, error, onRetry }: { loading: boolean; error?: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2 py-16 text-center" role={error ? 'alert' : 'status'} aria-live="polite">
      <h2 className="m-0 font-sans text-base font-semibold text-foreground">
        {error ? 'Screening data could not be loaded' : 'Loading screening data…'}
      </h2>
      {error && (
        <>
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" onClick={onRetry}>
            Try again
          </Button>
        </>
      )}
      {loading && <p className="text-sm text-muted-foreground">Please wait.</p>}
    </div>
  )
}
function QueueContent() {
  const query = useSearch({ from: '/_authenticated/security-screening/screening-queue' })
  const navigate = useNavigate({ from: '/security-screening/screening-queue' })
  const { fetchWithAuth } = useAppAuth()
  const [refresh, setRefresh] = useState(0)
  const [banner, setBanner] = useState('')
  const [pagination, setPagination] = useState<{ scope: string; cursors: string[]; index: number }>({ scope: '', cursors: [''], index: 0 })
  const [mutation, setMutation] = useState<{ id: string; saving: boolean; error?: string; requiresReload: boolean }>()
  const saving = useRef(false)
  const selectedRef = useRef(query.review)
  const mounted = useRef(false)
  useEffect(() => {
    selectedRef.current = query.review
  }, [query.review])
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const scope = JSON.stringify([query.status, query.sort, query.q])
  const page = pagination.scope === scope ? pagination : { scope, cursors: [''], index: 0 }
  const params = new URLSearchParams({ status: query.status, sort: query.sort ?? 'departure', q: query.q ?? '', limit: '20' })
  if (page.cursors[page.index]) params.set('cursor', page.cursors[page.index])
  const queue = useScreeningRead<ApiQueue>(`/api/security/screenings?${params}`, refresh)
  const detail = useScreeningRead<ApiDetail>(query.review ? `/api/security/screenings/${encodeURIComponent(query.review)}` : '', refresh)
  const selected = detail.data ? mapDetail(detail.data) : undefined
  const [lastQueue, setLastQueue] = useState<ApiQueue>()
  if (queue.data && queue.data !== lastQueue) setLastQueue(queue.data)
  const countData = queue.data ?? lastQueue
  const counts = countData ? mapCounts(countData) : { 'Needs review': 0, Held: 0, Flagged: 0, 'Decided today': 0 }
  const filter = statusFilters[query.status]
  const decided = filter === 'Decided today'
  const description = decided
    ? 'Decisions made today. Earlier reviews are retained in the audit history.'
    : filter === 'Held'
      ? 'Check-ins blocked until a security decision is recorded.'
      : filter === 'Flagged'
        ? 'Possible matches awaiting review. Check-in is not held.'
        : null
  function reload() {
    if (saving.current) return
    setMutation(undefined)
    if (!query.review) setPagination({ scope: '', cursors: [''], index: 0 })
    setRefresh((value) => value + 1)
  }
  function goToQueue() {
    if (!saving.current) void navigate({ search: (previous) => ({ ...previous, review: undefined }) })
  }
  async function save(draft: ReviewDraft) {
    if (!selected || saving.current || (mutation?.id === selected.id && mutation.requiresReload)) return
    saving.current = true
    setMutation({ id: selected.id, saving: true, requiresReload: false })
    try {
      const result = await postReview(fetchWithAuth, selected, draft)
      if (!mounted.current) return
      setRefresh((value) => value + 1)
      setPagination({ scope: '', cursors: [''], index: 0 })
      if (selectedRef.current === selected.id) {
        setBanner(
          result.clearance === 'denied'
            ? `Decision saved · ${selected.displayName}. Screening denies check-in. Authority notification is simulated.`
            : result.clearance === 'held'
              ? `Decision saved · ${selected.displayName}. Other screening checks still require a decision.`
              : `Decision saved · ${selected.displayName}. No remaining screening holds.`,
        )
        void navigate({ search: { status: 'needs-review' } })
      }
      setMutation(undefined)
    } catch (error: unknown) {
      if (!mounted.current) return
      const known = error instanceof ScreeningApiError
      setMutation({
        id: selected.id,
        saving: false,
        requiresReload: !known || error.status !== 400,
        error: known ? error.message : 'Could not confirm whether the decision was saved. Reload the latest decision before trying again.',
      })
    } finally {
      saving.current = false
    }
  }
  const detailError = detail.authError ?? detail.error?.message
  const queueError = queue.authError ?? queue.error?.message
  return (
    <ScreeningShell
      reviewing={!!selected && !latestReview(selected)}
      held={counts.Held}
      onQueue={goToQueue}
      navigationDisabled={!!mutation?.saving}
    >
      {query.review ? (
        detail.loading || detailError ? (
          <RequestState loading={detail.loading} error={detailError} onRetry={reload} />
        ) : selected?.outcome === 'clear' ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center" role="status">
            <h2 className="m-0 font-sans text-base font-semibold text-foreground">No review needed</h2>
            <p className="text-sm text-muted-foreground">This check is clear and cannot be reviewed.</p>
            <Button variant="outline" onClick={goToQueue}>
              Back to queue
            </Button>
          </div>
        ) : selected ? (
          <ScreeningReview
            key={`${selected.id}-${latestReview(selected)?.revision ?? 0}`}
            record={selected}
            onBack={goToQueue}
            onSave={(draft) => {
              void save(draft)
            }}
            submission={{
              saving: !!mutation?.saving,
              error: mutation?.id === selected.id ? mutation.error : undefined,
              requiresReload: mutation?.id === selected.id && mutation.requiresReload,
              onReload: reload,
            }}
          />
        ) : null
      ) : (
        <div className="flex flex-col gap-4">
          {banner && (
            <Alert role="status" className="border-emerald-200 bg-emerald-50 text-emerald-900">
              <CheckCircle2 />
              <AlertDescription className="text-emerald-900">{banner}</AlertDescription>
            </Alert>
          )}
          <QueueToolbar
            filter={filter}
            counts={counts}
            onFilter={() => setBanner('')}
            search={query.q ?? ''}
            onSearch={(value) =>
              void navigate({ search: (previous) => ({ ...previous, q: value || undefined }), replace: true, resetScroll: false })
            }
            sort={sortLabels[query.sort ?? 'departure']}
            onSort={(value) => void navigate({ search: (previous) => ({ ...previous, sort: sortValues[value] }), resetScroll: false })}
          />
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
          {queue.loading && !queueError ? (
            <div className="flex flex-col gap-2" role="status" aria-label="Loading queue" aria-busy="true">
              <span className="sr-only">Loading screening data…</span>
              {[0, 1, 2].map((row) => (
                <Skeleton className="h-14 w-full" key={row} />
              ))}
            </div>
          ) : queueError ? (
            <RequestState loading={queue.loading} error={queueError} onRetry={reload} />
          ) : (
            queue.data && (
              <>
                <QueueList
                  records={queue.data.items.map((record) => mapQueueItem(record, queue.data!.now))}
                  decided={decided}
                  onOpen={(id) => void navigate({ search: (previous) => ({ ...previous, review: id }) })}
                />
                <nav className="flex items-center justify-end gap-2" aria-label="Queue pages">
                  <Button variant="outline" disabled={page.index === 0} onClick={() => setPagination({ ...page, index: page.index - 1 })}>
                    Previous
                  </Button>
                  <PageSelect
                    label="Queue page"
                    value={page.index}
                    count={page.cursors.length}
                    onChange={(index) => setPagination({ ...page, index })}
                  />
                  <Button
                    variant="outline"
                    disabled={!queue.data.nextCursor}
                    onClick={() => {
                      if (queue.data?.nextCursor)
                        setPagination({
                          scope,
                          cursors: [...page.cursors.slice(0, page.index + 1), queue.data.nextCursor],
                          index: page.index + 1,
                        })
                    }}
                  >
                    Next
                  </Button>
                </nav>
              </>
            )
          )}
        </div>
      )}
    </ScreeningShell>
  )
}

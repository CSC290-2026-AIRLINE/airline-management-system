import { PageSelect } from '@staff-web/features/security-screening/components/PageSelect'
import { Component, useEffect, useState, type ReactNode } from 'react'
import { ScreeningShell } from '@staff-web/features/security-screening/components/ScreeningShell'
import { useScreeningRead } from '@staff-web/features/security-screening/use-screening-api'
import type { ApiQueue } from '@staff-web/features/security-screening/screening-api'
import { AlertCircle, CheckCircle2, Plus } from 'lucide-react'
import { Alert, AlertDescription } from '@staff-web/components/ui/alert'
import { Button } from '@staff-web/components/ui/button'
import { Input } from '@staff-web/components/ui/input'
import { Skeleton } from '@staff-web/components/ui/skeleton'
import { WatchlistTable } from './components/WatchlistTable'
import { WatchlistSelect } from './components/WatchlistSelect'
import { WatchlistDialog } from './components/WatchlistDialog'
import { WatchlistEntryForm } from './components/WatchlistEntryForm'
import { ClearEntryModal } from './components/ClearEntryModal'
import { useWatchlist } from './hooks/useWatchlist'
import { listTypes, type EntryStatus, type ListType, type WatchlistEntry } from './watchlist.types'

class WatchlistBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? (
      <div className="flex flex-col items-center gap-2 py-16 text-center">
        <h1 className="m-0 font-sans text-lg font-semibold text-foreground">Watchlist could not be displayed</h1>
        <p className="text-sm text-muted-foreground">Please reload the page to try again.</p>
        <Button onClick={() => window.location.reload()}>Reload</Button>
      </div>
    ) : (
      this.props.children
    )
  }
}

export function WatchlistView() {
  return (
    <WatchlistBoundary>
      <WatchlistContent />
    </WatchlistBoundary>
  )
}

function WatchlistContent() {
  const watchlist = useWatchlist()
  const [countsRevision, setCountsRevision] = useState(0)
  const screening = useScreeningRead<ApiQueue>('/api/security/screenings?status=needs-review&limit=1', countsRevision)
  useEffect(() => {
    const refreshCounts = () => setCountsRevision((value) => value + 1)
    window.addEventListener('focus', refreshCounts)
    return () => window.removeEventListener('focus', refreshCounts)
  }, [])
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')
  async function edit(entry: WatchlistEntry) {
    setDetailLoading(true)
    setDetailError('')
    watchlist.setMessage('')
    try {
      setSelected(await watchlist.detail(entry.id))
      setModal('edit')
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : 'Could not load entry.')
    } finally {
      setDetailLoading(false)
    }
  }
  const [modal, setModal] = useState<'add' | 'edit' | 'clear' | null>(null)
  const [selected, setSelected] = useState<WatchlistEntry>()
  return (
    <ScreeningShell activeTab="watchlist" held={screening.data?.counts.held} navigationDisabled={watchlist.saving}>
      <section aria-label="Watchlist" className="flex flex-col gap-4">
        {watchlist.message && (
          <Alert role="status" className="border-emerald-200 bg-emerald-50 text-emerald-900">
            <CheckCircle2 />
            <AlertDescription className="text-emerald-900">{watchlist.message}</AlertDescription>
          </Alert>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="search"
            aria-label="Name or passport number"
            placeholder="Name or passport number"
            value={watchlist.query}
            onChange={(event) => watchlist.setQuery(event.target.value)}
            className="min-w-48 flex-1 sm:max-w-xs"
          />
          <WatchlistSelect
            label="Status"
            value={watchlist.status}
            onChange={(value) => watchlist.setStatus(value as EntryStatus | 'all')}
            options={[
              { value: 'active', label: 'Status: Active' },
              { value: 'cleared', label: 'Status: Cleared' },
              { value: 'all', label: 'Status: All' },
            ]}
          />
          <WatchlistSelect
            label="List type"
            value={watchlist.listType}
            onChange={(value) => watchlist.setListType(value as ListType | 'all')}
            options={[{ value: 'all', label: 'All list types' }, ...Object.entries(listTypes).map(([value, label]) => ({ value, label }))]}
          />
          <Button
            className="ml-auto"
            disabled={watchlist.saving || detailLoading}
            onClick={() => {
              watchlist.setMessage('')
              setSelected(undefined)
              setModal('add')
            }}
          >
            <Plus />
            Add entry
          </Button>
        </div>
        {detailError && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{detailError}</AlertDescription>
          </Alert>
        )}
        {detailLoading && (
          <p role="status" className="text-sm text-muted-foreground">
            Loading entry…
          </p>
        )}
        {watchlist.error && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription className="flex-row items-center gap-3">
              <span className="text-destructive">{watchlist.error}</span>
              <Button variant="outline" size="sm" onClick={watchlist.retry}>
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        )}
        {watchlist.loading ? (
          <div role="status" aria-label="Loading watchlist" className="flex flex-col gap-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          !watchlist.error && (
            <WatchlistTable
              key={`${watchlist.query}:${watchlist.status}:${watchlist.listType}`}
              entries={watchlist.visibleEntries}
              onEdit={(entry) => {
                if (!detailLoading && !watchlist.saving) void edit(entry)
              }}
            />
          )
        )}
        <nav className="flex items-center justify-end gap-2" aria-label="Watchlist pages">
          <Button
            variant="outline"
            disabled={watchlist.pageNumber === 1 || watchlist.loading || watchlist.saving}
            onClick={watchlist.previousPage}
          >
            Previous
          </Button>
          <PageSelect
            label="Watchlist page"
            value={watchlist.pageNumber - 1}
            count={watchlist.visitedPages}
            disabled={watchlist.loading || watchlist.saving}
            onChange={watchlist.selectPage}
          />
          <Button
            variant="outline"
            disabled={!watchlist.nextCursor || watchlist.loading || watchlist.saving || !!watchlist.error}
            onClick={watchlist.nextPage}
          >
            Next
          </Button>
        </nav>
      </section>
      {(modal === 'add' || modal === 'edit') && (
        <WatchlistDialog
          title={modal === 'add' ? 'Add watchlist entry' : 'Edit watchlist entry'}
          onClose={() => {
            if (!watchlist.saving) setModal(null)
          }}
        >
          <WatchlistEntryForm
            key={selected?.id ?? 'add'}
            entry={selected}
            onSave={async (fields) => {
              await watchlist.save(fields, selected)
              setCountsRevision((value) => value + 1)
              setModal(null)
            }}
            onCancel={() => setModal(null)}
            onClear={() => setModal('clear')}
          />
        </WatchlistDialog>
      )}
      {modal === 'clear' && selected && (
        <ClearEntryModal
          entry={selected}
          onCancel={() => setModal('edit')}
          onClear={async (reason) => {
            await watchlist.clear(selected, reason)
            setCountsRevision((value) => value + 1)
            setModal(null)
          }}
        />
      )}
    </ScreeningShell>
  )
}

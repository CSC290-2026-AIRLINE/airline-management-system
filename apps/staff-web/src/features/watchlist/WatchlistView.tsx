import { PageSelect } from '@staff-web/features/security-screening/components/PageSelect'
import { Component, useEffect, useState, type ReactNode } from 'react'
import { ScreeningShell } from '@staff-web/features/security-screening/components/ScreeningShell'
import { useScreeningRead } from '@staff-web/features/security-screening/use-screening-api'
import type { ApiQueue } from '@staff-web/features/security-screening/screening-api'
import { WatchlistResults } from './components/WatchlistResults'
import { WatchlistSelect } from './components/WatchlistSelect'
import { WatchlistDialog } from './components/WatchlistDialog'
import { WatchlistEntryForm } from './components/WatchlistEntryForm'
import { ClearEntryModal } from './components/ClearEntryModal'
import { useWatchlist } from './hooks/useWatchlist'
import { listTypes, type EntryStatus, type ListType, type WatchlistEntry } from './watchlist.types'
import './watchlist.css'

class WatchlistBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? (
      <div className="wl-content wl-empty">
        <h1>Watchlist could not be displayed</h1>
        <p>Please reload the page to try again.</p>
        <button onClick={() => window.location.reload()}>Reload</button>
      </div>
    ) : (
      this.props.children
    )
  }
}

export function WatchlistView({ onSignOut }: { onSignOut?: () => Promise<void> }) {
  return (
    <WatchlistBoundary>
      <WatchlistContent onSignOut={onSignOut} />
    </WatchlistBoundary>
  )
}

function WatchlistContent({ onSignOut }: { onSignOut?: () => Promise<void> }) {
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
    <ScreeningShell activeTab="watchlist" held={screening.data?.counts.held} onSignOut={onSignOut} navigationDisabled={watchlist.saving}>
      <div className="wl-content">
        <section aria-label="Watchlist">
          {watchlist.message && (
            <div className="wl-banner" role="status">
              <span className="wl-banner-check" aria-hidden="true">
                ✓
              </span>
              <span>{watchlist.message}</span>
            </div>
          )}
          <div className="wl-toolbar">
            <input
              type="search"
              aria-label="Name or passport number"
              placeholder="Name or passport number"
              value={watchlist.query}
              onChange={(event) => watchlist.setQuery(event.target.value)}
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
              options={[
                { value: 'all', label: 'All list types' },
                ...Object.entries(listTypes).map(([value, label]) => ({ value, label })),
              ]}
            />
            <button
              className="wl-primary wl-add"
              disabled={watchlist.saving || detailLoading}
              onClick={() => {
                watchlist.setMessage('')
                setSelected(undefined)
                setModal('add')
              }}
            >
              + <span className="wl-desktop-label">Add entry</span>
              <span className="wl-mobile-label">Add watchlist entry</span>
            </button>
          </div>
          {detailError && (
            <p className="wl-error" role="alert">
              {detailError}
            </p>
          )}
          {detailLoading && <p role="status">Loading entry…</p>}
          {watchlist.error && (
            <div role="alert">
              <p className="wl-error">{watchlist.error}</p>
              <button onClick={watchlist.retry}>Retry</button>
            </div>
          )}
          {watchlist.loading ? (
            <p role="status">Loading watchlist…</p>
          ) : (
            !watchlist.error && (
              <WatchlistResults
                key={`${watchlist.query}:${watchlist.status}:${watchlist.listType}`}
                entries={watchlist.visibleEntries}
                onEdit={(entry) => {
                  if (!detailLoading && !watchlist.saving) void edit(entry)
                }}
              />
            )
          )}
          <nav className="wl-pagination" aria-label="Watchlist pages">
            <button disabled={watchlist.pageNumber === 1 || watchlist.loading || watchlist.saving} onClick={watchlist.previousPage}>
              Previous
            </button>
            <PageSelect
              label="Watchlist page"
              value={watchlist.pageNumber - 1}
              count={watchlist.visitedPages}
              disabled={watchlist.loading || watchlist.saving}
              onChange={watchlist.selectPage}
            />
            <button
              disabled={!watchlist.nextCursor || watchlist.loading || watchlist.saving || !!watchlist.error}
              onClick={watchlist.nextPage}
            >
              Next
            </button>
          </nav>
        </section>
      </div>
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

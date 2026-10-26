import { Component, useState, type ReactNode } from 'react'
import screeningIcon from './assets/screening.svg'
import watchlistIcon from './assets/watchlist.svg'
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
      <main className="wl-page wl-empty">
        <h1>Watchlist could not be displayed</h1>
        <p>Please reload the page to try again.</p>
        <button onClick={() => window.location.reload()}>Reload</button>
      </main>
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
  const [menuOpen, setMenuOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState('')
  async function signOut() {
    if (!onSignOut) return
    setSigningOut(true)
    try {
      await onSignOut()
    } catch {
      setSignOutError('Could not sign out. Please try again.')
    } finally {
      setSigningOut(false)
    }
  }
  const navigation = (
    <>
      <button disabled title="Customer Search is not implemented in this checkout">
        Customer Search
      </button>
      <a href="/watchlist" aria-current="page">
        Security Screening
      </a>
    </>
  )
  const signOutButton = (
    <button
      disabled={!onSignOut || signingOut}
      title={!onSignOut ? 'No sign-in is required for this UI preview' : undefined}
      onClick={() => void signOut()}
    >
      {signingOut ? 'Signing out…' : 'Sign out'}
    </button>
  )

  return (
    <div className={`wl-page${watchlist.message ? ' wl-has-message' : ''}`}>
      <aside className="wl-sidebar" aria-label="Staff navigation">
        <div className="wl-brand">Airlines</div>
        <div className="wl-gold-line" />
        <p className="wl-workspace">ADMIN WORKSPACE</p>
        <nav>{navigation}</nav>
        <div className="wl-account">
          <strong>Security staff</strong>
          <p>Navigation follows assigned staff permissions.</p>
          {signOutButton}
        </div>
      </aside>
      <main className="wl-main">
        <header className="wl-header">
          <div className="wl-mobile-header">
            <span className="wl-brand">Airlines</span>
            <span className="wl-staff">STAFF</span>
            <button
              className="wl-menu"
              aria-label="Staff menu"
              aria-expanded={menuOpen}
              aria-controls="wl-mobile-nav"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              <span />
              <span />
              <span />
            </button>
          </div>
          {menuOpen && (
            <nav className="wl-mobile-nav" id="wl-mobile-nav">
              {navigation}
              {signOutButton}
            </nav>
          )}
          <h1>Security Screening</h1>
          <p>Review possible watchlist matches or manage watchlist entries. Security role only.</p>
          <nav className="wl-tabs" aria-label="Security screening">
            <button disabled title="Screening Queue is not implemented in this checkout">
              <img src={screeningIcon} alt="" width="16" height="16" />
              <span className="wl-desktop-label">Screening Queue</span>
              <span className="wl-mobile-label">Screening Queue</span>
            </button>
            <a href="/watchlist" aria-current="page">
              <img src={watchlistIcon} alt="" width="16" height="16" />
              Watchlist
            </a>
          </nav>
        </header>
        <section aria-label="Watchlist">
          {watchlist.message && (
            <div className="wl-banner" role="status">
              <span className="wl-banner-check" aria-hidden="true">
                ✓
              </span>
              <span>{watchlist.message}</span>
            </div>
          )}
          {signOutError && (
            <p className="wl-error" role="alert">
              {signOutError}
            </p>
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
          {watchlist.nextCursor && !watchlist.loading && !watchlist.error && (
            <button onClick={watchlist.loadMore}>Load more entries</button>
          )}
        </section>
      </main>
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
            setModal(null)
          }}
        />
      )}
    </div>
  )
}

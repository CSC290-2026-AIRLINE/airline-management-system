import { Component, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import type { Decision, Filter } from './types'
import { sortLabels, sortValues, statusFilters } from './queue-search'
import { screeningFixtures } from './mock-data'
import { QueueToolbar } from './components/QueueToolbar'
import { QueueList } from './components/QueueList'
import { ScreeningShell } from './components/ScreeningShell'
import { ScreeningReview } from './components/ScreeningReview'
import './fonts.css'
import './screening.css'

class ScreeningBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? (
      <div className="sq-empty">
        <h2>Screening queue could not be displayed</h2>
        <button onClick={() => window.location.reload()}>Reload</button>
      </div>
    ) : (
      this.props.children
    )
  }
}

export function ScreeningQueue({ onSignOut }: { onSignOut: () => void }) {
  return (
    <ScreeningBoundary>
      <QueueContent onSignOut={onSignOut} />
    </ScreeningBoundary>
  )
}

function QueueContent({ onSignOut }: { onSignOut: () => void }) {
  const query = useSearch({ from: '/_authenticated/screening-queue' })
  const navigate = useNavigate({ from: '/screening-queue' })
  const [records, setRecords] = useState(screeningFixtures)
  const filter = statusFilters[query.status]
  const search = query.q ?? ''
  const sort = sortLabels[query.sort ?? 'departure']
  const selectedId = query.review
  const [banner, setBanner] = useState('')
  const [watchlistNotice, setWatchlistNotice] = useState(false)
  const selected = records.find((record) => record.id === selectedId)
  const pending = records.filter((record) => !record.decisions.length)
  const counts: Record<Filter, number> = {
    'Needs review': pending.length,
    Held: pending.filter((record) => record.status === 'Held').length,
    Flagged: pending.filter((record) => record.status === 'Flagged').length,
    'Decided today': records.length - pending.length,
  }
  const decided = filter === 'Decided today'
  const visible = records.filter(
    (record) =>
      (decided ? record.decisions.length > 0 : !record.decisions.length && (filter === 'Needs review' || record.status === filter)) &&
      `${record.name} ${record.flight}`.toLowerCase().includes(search.trim().toLowerCase()),
  )
  // The initial decided list follows the exact Figma order; selecting a sort applies it explicitly.
  if (!decided || query.sort)
    visible.sort((a, b) =>
      sort === 'Nearest departure'
        ? (decided ? 0 : Number(b.status === 'Held') - Number(a.status === 'Held')) || a.departureOrder - b.departureOrder
        : sort === 'Waiting longest'
          ? a.waitingOrder - b.waitingOrder
          : { Strong: 0, Probable: 1, Weak: 2 }[a.match] - { Strong: 0, Probable: 1, Weak: 2 }[b.match],
    )
  function goToQueue() {
    void navigate({ search: (previous) => ({ ...previous, review: undefined }) })
  }
  function save(decision: Decision) {
    if (!selected) return
    setRecords((current) =>
      current.map((record) =>
        record.id === selected.id
          ? {
              ...record,
              status: decision.status,
              urgent: false,
              decisions: [...record.decisions, decision],
              history: [...record.history, [`Today ${decision.at}`, 'Review', '—', decision.status, `By ${decision.by}`]],
            }
          : record,
      ),
    )
    setBanner(
      decision.status === 'Confirmed'
        ? `Match confirmed · ${selected.displayName} — check-in stays denied and the authority has been notified (Feature 13). The review is logged in Feature 15.`
        : selected.match === 'Weak'
          ? `Decision saved · ${selected.displayName}’s flag cleared.`
          : `Decision saved · ${selected.displayName} released, check-in can continue.`,
    )
    void navigate({ search: { status: 'needs-review' } })
  }
  return (
    <ScreeningShell
      reviewing={!!selected && !selected.decisions.length}
      held={counts.Held}
      onQueue={goToQueue}
      onSignOut={onSignOut}
      onWatchlist={() => setWatchlistNotice(!watchlistNotice)}
    >
      {watchlistNotice && (
        <div className="sq-info-banner" role="status">
          Watchlist management is outside this Screening Queue prototype.
          <button aria-label="Dismiss watchlist message" onClick={() => setWatchlistNotice(false)}>
            ×
          </button>
        </div>
      )}
      {selectedId && !selected ? (
        <div className="sq-empty" role="status">
          <h2>Review not found</h2>
          <p>This review is not available in the current queue.</p>
          <button className="sq-button" onClick={goToQueue}>
            Back to queue
          </button>
        </div>
      ) : selected ? (
        <ScreeningReview key={selected.id} record={selected} onBack={goToQueue} onSave={save} />
      ) : (
        <>
          {banner && (
            <div className="sq-success-banner" role="status">
              <span>✓</span>
              <span>{banner}</span>
            </div>
          )}
          <QueueToolbar
            filter={filter}
            counts={counts}
            onFilter={() => {
              setBanner('')
            }}
            search={search}
            onSearch={(value) =>
              void navigate({ search: (previous) => ({ ...previous, q: value || undefined }), replace: true, resetScroll: false })
            }
            sort={sort}
            onSort={(value) => {
              void navigate({ search: (previous) => ({ ...previous, sort: sortValues[value] }), resetScroll: false })
            }}
          />
          <p className="sq-queue-description">
            {decided ? (
              'Decisions made today. A read-only record; every decision is also logged in Feature 15’s audit log.'
            ) : filter === 'Held' ? (
              'Check-ins blocked until a security decision is recorded.'
            ) : filter === 'Flagged' ? (
              'Possible matches from booking or new watchlist entries. Check-in is not held.'
            ) : (
              <>
                <span className="sq-desktop-only">
                  Everything waiting for a decision: held check-ins first, then flags from booking or new entries.
                </span>
                <span className="sq-mobile-only">Everything waiting for a decision: held check-ins first, then flags.</span>
              </>
            )}
          </p>
          <QueueList
            records={visible}
            decided={decided}
            onOpen={(id) => {
              void navigate({ search: (previous) => ({ ...previous, review: id }) })
            }}
          />
          <p className="sq-legend">
            Held = check-in is blocked until you decide. Flagged = found at booking or after a new entry; nothing is blocked yet. Rows due
            within 3 hours are highlighted.
          </p>
          <p className="sq-legend">
            Strong = passport + nationality match · Probable = name + date of birth match · Weak = similar name only (doesn’t hold check-in)
          </p>
        </>
      )}
    </ScreeningShell>
  )
}

import { Component, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import type { ReviewDraft } from './types'
import { appendReview, latestReview, queueCounts, selectQueue } from './screening-model'
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
  const selected = records.find((record) => record.id === selectedId)
  const counts = queueCounts(records)
  const decided = filter === 'Decided today'
  const visible = selectQueue(records, filter, search, sort)
  const description = decided
    ? 'Decisions made today. A read-only record; every decision is also logged in Feature 15’s audit log.'
    : filter === 'Held'
      ? 'Check-ins blocked until a security decision is recorded.'
      : filter === 'Flagged'
        ? 'Possible matches from booking or new watchlist entries. Check-in is not held.'
        : null
  function goToQueue() {
    void navigate({ search: (previous) => ({ ...previous, review: undefined }) })
  }
  function save(draft: ReviewDraft) {
    if (!selected) return
    setRecords((current) => current.map((record) => (record.id === selected.id ? appendReview(record, draft) : record)))
    setBanner(
      draft.decision === 'confirmed'
        ? `Match confirmed · ${selected.displayName} — check-in stays denied and the authority has been notified (Feature 13). The review is logged in Feature 15.`
        : selected.outcome === 'held'
          ? `Decision saved · ${selected.displayName} released, check-in can continue.`
          : `Decision saved · ${selected.displayName}’s flag cleared.`,
    )
    void navigate({ search: { status: 'needs-review' } })
  }
  return (
    <ScreeningShell reviewing={!!selected && !latestReview(selected)} held={counts.Held} onQueue={goToQueue} onSignOut={onSignOut}>
      {selectedId && !selected ? (
        <div className="sq-empty" role="status">
          <h2>Review not found</h2>
          <p>This review is not available in the current queue.</p>
          <button className="sq-button" onClick={goToQueue}>
            Back to queue
          </button>
        </div>
      ) : selected?.outcome === 'clear' ? (
        <div className="sq-empty" role="status">
          <h2>No review needed</h2>
          <p>This check is clear and cannot be reviewed.</p>
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
          {description && <p className="sq-queue-description">{description}</p>}
          <QueueList
            records={visible}
            decided={decided}
            onOpen={(id) => {
              void navigate({ search: (previous) => ({ ...previous, review: id }) })
            }}
          />
        </>
      )}
    </ScreeningShell>
  )
}

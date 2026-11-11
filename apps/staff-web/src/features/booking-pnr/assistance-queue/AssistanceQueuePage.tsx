import { useCallback, useEffect, useState } from 'react'
import { useAppAuth } from '@staff-web/auth/AuthProvider'
import { useBookingPnrApi } from '../api/client'
import type { ServiceRequestQueueItem } from '../api/types'
import { AssistanceQueue } from './AssistanceQueue'

export function AssistanceQueuePage() {
  const { fetchWithAuth } = useAppAuth()
  const { updateServiceRequest } = useBookingPnrApi()
  const [requests, setRequests] = useState<ServiceRequestQueueItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const response = await fetchWithAuth('/api/staff/service-requests', { signal })
      if (!response.ok) throw new Error('Could not load assistance requests')
      return (await response.json()) as ServiceRequestQueueItem[]
    },
    [fetchWithAuth],
  )

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
      .then((items) => {
        if (!controller.signal.aborted) {
          setRequests(items)
          setError(null)
          setLoading(false)
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setError('Could not load assistance requests. Please try again.')
          setLoading(false)
        }
      })
    return () => controller.abort()
  }, [load, revision])

  async function update(id: string, status: 'accepted' | 'rejected' | 'completed', decisionNote?: string) {
    await updateServiceRequest(id, { status, decisionNote })
    // If refresh fails, report it separately: the update may already have succeeded.
    try {
      setRequests(await load())
      setError(null)
    } catch {
      setError('The request was updated, but the list could not refresh. Please reload it.')
    }
  }

  return (
    <main className="assistance-page">
      <header className="assistance-page__header">
        <p className="assistance-page__eyebrow">Customer management</p>
        <h1>Special Assistance Queue</h1>
        <p>Review requests from bookings. Oldest departure first.</p>
      </header>
      {error && (
        <div role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => setRevision((value) => value + 1)}>
            Reload requests
          </button>
        </div>
      )}
      {loading ? <p role="status">Loading assistance requests…</p> : <AssistanceQueue requests={requests} onUpdate={update} />}
    </main>
  )
}

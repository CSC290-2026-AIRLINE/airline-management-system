import { CircleAlert } from 'lucide-react'
import { Alert, AlertDescription } from '@staff-web/components/ui/alert'
import { Button } from '@staff-web/components/ui/button'
import { Skeleton } from '@staff-web/components/ui/skeleton'
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

  function reload() {
    setError(null)
    setLoading(true)
    setRevision((value) => value + 1)
  }

  return (
    <main className="mx-auto flex w-full max-w-[1440px] min-w-0 flex-col gap-4 px-4 pt-4 pb-10 sm:px-6 lg:px-[4%] lg:pt-12 lg:pb-16">
      <header className="space-y-1 [&_h1]:text-2xl [&_h1]:leading-tight [&_h1]:font-bold [&_h1]:tracking-tight sm:[&_h1]:text-3xl [&_p]:text-sm [&_p]:text-muted-foreground sm:[&_p]:text-base">
        <h1>Special Assistance Queue</h1>
        <p>Review requests from bookings. Oldest departure first.</p>
      </header>
      {error && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertDescription className="flex flex-col items-start gap-3">
            <p>{error}</p>
            <Button variant="outline" size="sm" type="button" onClick={reload}>
              Reload requests
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {loading ? (
        <div className="flex flex-col gap-2" aria-busy="true" role="status">
          <span className="sr-only">Loading assistance requests…</span>
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-2/3" />
        </div>
      ) : (
        (requests.length > 0 || !error) && <AssistanceQueue requests={requests} onUpdate={update} />
      )}
    </main>
  )
}

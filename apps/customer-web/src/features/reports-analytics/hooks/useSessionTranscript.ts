import { useCallback, useEffect, useState } from 'react'
import { useGetReportSessionTranscript } from '../api/reports'
import { fixtureTranscript } from '../fixtures'
import type { ReportSession, ReportSessionTranscript } from '../types'

export interface SessionTranscriptState {
  loading: boolean
  error: string | null
  transcript: ReportSessionTranscript | null
  reload: () => void
}

interface TranscriptState {
  /** The session the loaded transcript belongs to. `null` before anything is loaded. */
  sessionId: string | null
  loading: boolean
  error: string | null
  transcript: ReportSessionTranscript | null
}

/**
 * Loads the chat transcript for the session the user opened. As with the overview, a failed request falls back to
 * the transcript the design ships with so the modal is never empty.
 *
 * The loaded transcript is only handed back when it belongs to the session that is currently open, so switching
 * rows never shows the previous session's chat while the next one loads.
 */
export function useSessionTranscript(session: ReportSession | null): SessionTranscriptState {
  const getReportSessionTranscript = useGetReportSessionTranscript()

  const [state, setState] = useState<TranscriptState>({ sessionId: null, loading: false, error: null, transcript: null })
  const [reloadKey, setReloadKey] = useState(0)

  const sessionId = session?.id ?? null

  useEffect(() => {
    if (!sessionId || !session) {
      return
    }
    let cancelled = false
    ;(async () => {
      setState((prev) => ({ ...prev, sessionId, loading: true, error: null }))
      try {
        const transcript = await getReportSessionTranscript(sessionId)
        if (cancelled) return
        setState({ sessionId, loading: false, error: null, transcript })
      } catch (e: unknown) {
        if (cancelled) return
        setState({
          sessionId,
          loading: false,
          error: e instanceof Error ? e.message : String(e),
          transcript: fixtureTranscript(session),
        })
      }
    })()
    return () => {
      cancelled = true
    }
    // The fetch helper is rebuilt every render, so it cannot be a dependency. `reloadKey` is the retry signal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, reloadKey])

  const reload = useCallback(() => {
    setReloadKey((key) => key + 1)
  }, [])

  if (state.sessionId !== sessionId) {
    return { loading: sessionId !== null, error: null, transcript: null, reload }
  }
  return { loading: state.loading, error: state.error, transcript: state.transcript, reload }
}

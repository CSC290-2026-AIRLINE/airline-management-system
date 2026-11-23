import { useEffect, useRef } from 'react'
import { formatCount, formatDayMonthYear, formatDuration, formatTime } from './format'
import type { ReportSession, ReportSessionTranscript } from './types'

interface SessionChatModalProps {
  session: ReportSession
  /** The transcript, `null` while it is still loading. */
  transcript: ReportSessionTranscript | null
  loading: boolean
  /** Set when the transcript request failed and the fallback was used instead. */
  error: string | null
  onClose: () => void
}

/**
 * "Modal / Session chat history" (Figma node 8:767). Opened from a row in Session Logs, showing the
 * passenger questions on the right and the robot's answers on the left.
 */
export function SessionChatModal({ session, transcript, loading, error, onClose }: SessionChatModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeButtonRef.current?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const facts = [
    formatDayMonthYear(session.started_at),
    session.ended_at ? `${formatTime(session.started_at)} – ${formatTime(session.ended_at)}` : formatTime(session.started_at),
    formatDuration(session.duration_seconds),
    `${formatCount(session.questions)} questions`,
    `${formatCount(session.unanswered)} unanswered`,
  ]

  let questionNumber = 0

  return (
    <div className="ra-modalOverlay" onClick={onClose}>
      <div
        className="ra-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ra-modalTitle"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="ra-modalHeader">
          <h2 className="ra-modalTitle" id="ra-modalTitle">
            Session #{session.session_no}
          </h2>
          <p className="ra-modalMeta">{facts.join(' · ')}</p>
        </header>

        <button ref={closeButtonRef} type="button" className="ra-modalIconButton" aria-label="Close chat history" onClick={onClose}>
          ×
        </button>

        <div className="ra-transcript">
          {loading && !transcript ? (
            <p className="ra-modalMeta">Loading chat history…</p>
          ) : (
            transcript?.turns.map((turn) => {
              const label =
                turn.role === 'passenger' ? `Passenger · Q${(questionNumber += 1)}` : turn.text === null ? 'Robot · Unanswered' : 'Robot'
              return (
                <div key={turn.order} className={`ra-turn ra-turn--${turn.role}`}>
                  <p className="ra-turnLabel">{label}</p>
                  <div className={`ra-bubble${turn.text === null ? ' ra-bubble--unanswered' : ''}`}>
                    <p>{turn.text ?? 'No answer recorded'}</p>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {error && <p className="ra-modalNotice">Showing the design transcript — the chat history endpoint is not reachable.</p>}

        <footer className="ra-modalFooter">
          <button type="button" className="ra-modalClose" onClick={onClose}>
            Close
          </button>
        </footer>
      </div>
    </div>
  )
}

import { useState } from 'react'
import { useMyScreens } from '../hooks/useMyScreens'
import './MyAccessWidget.css'

/**
 * Tiny chip in the sidebar footer that says how many screens the signed-in user can open, and on click reveals the
 * full list of codes. Lives below "Sign out" so it never crowds the chrome — its job is to confirm the `/me/screens`
 * endpoint works, not to be a primary nav surface.
 */
export function MyAccessWidget() {
  const { codes, loading, error, source } = useMyScreens()
  const [open, setOpen] = useState(false)

  if (loading) {
    return (
      <div className="my-access" data-state="loading" aria-busy="true">
        Loading your access…
      </div>
    )
  }
  if (error) {
    return (
      <div className="my-access is-error" data-state="error" title={error}>
        Access check failed
      </div>
    )
  }

  return (
    <div className="my-access" data-source={source}>
      <button
        type="button"
        className="my-access-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="my-access-list"
        title={open ? 'Hide codes' : 'Show codes'}
      >
        {codes.length} screen{codes.length === 1 ? '' : 's'} you can open
      </button>
      {open && (
        <ul id="my-access-list" className="my-access-list">
          {codes.length === 0 ? (
            <li className="muted">No screens yet.</li>
          ) : (
            codes.map((c) => (
              <li key={c}>
                <span className="my-access-code">{c}</span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}

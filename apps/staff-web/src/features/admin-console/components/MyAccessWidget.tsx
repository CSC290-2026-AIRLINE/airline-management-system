import { useState } from 'react'
import { useMyScreens } from '../hooks/useMyScreens'

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
      <div className="mt-3 text-[11px] text-white/60 italic" data-state="loading" aria-busy="true">
        Loading your access…
      </div>
    )
  }
  if (error) {
    return (
      <div className="mt-3 text-[11px] text-[#fca5a5]" data-state="error" title={error}>
        Access check failed
      </div>
    )
  }

  return (
    <div className="mt-3 text-[11px] text-white/60" data-source={source}>
      <button
        type="button"
        className="w-full rounded-sm border border-white/20 px-2.5 py-1.5 text-left text-[11px] font-medium text-white/85 hover:border-white/30 hover:bg-white/5"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="my-access-list"
        title={open ? 'Hide codes' : 'Show codes'}
      >
        {codes.length} screen{codes.length === 1 ? '' : 's'} you can open
      </button>
      {open && (
        <ul id="my-access-list" className="mt-2 max-h-[220px] overflow-y-auto rounded-sm bg-black/20 px-2.5 py-2">
          {codes.length === 0 ? (
            <li className="py-1">No screens yet.</li>
          ) : (
            codes.map((c) => (
              <li key={c} className="border-b border-white/5 py-1 last:border-b-0">
                <span className="font-mono text-[11px] break-all text-white/85">{c}</span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}

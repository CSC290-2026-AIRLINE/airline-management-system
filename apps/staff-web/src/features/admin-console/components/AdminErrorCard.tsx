import './AdminErrorCard.css'

interface AdminErrorCardProps {
  /** Page label so the user knows which page failed. */
  page: 'Role access' | 'Audit log'
  /** Captured error message (typically `error.message`). */
  error: string | null
  /** Optional HTTP status — if known it goes into the headline. */
  status?: number
  /** Called when the user clicks Retry; the page passes its own refetcher. */
  onRetry: () => void
}

/**
 * Friendly diagnostic shown when an admin API call fails. Surfaces the HTTP status (when known) and the setup steps
 * the user can take to recover — replaces the small "Failed to load: …" placeholder that page bodies used to render.
 */
export function AdminErrorCard({ page, error, status, onRetry }: AdminErrorCardProps) {
  const headline = status ? `${page} — HTTP ${status}` : `${page} failed to load`
  const isAuth = status === 401 || status === 403

  return (
    <section className="page-body">
      <div className="admin-error-card" role="alert">
        <header>
          <span className="badge">!</span>
          <h2>{headline}</h2>
        </header>
        <p className="muted small">{error ?? 'Unknown error'}</p>

        {isAuth && (
          <div className="admin-error-section">
            <h3>This usually means one of two things</h3>
            <ol>
              <li>You are not signed in to the staff app.</li>
              <li>
                Your signed-in account does not have <code>is_admin=true</code> on its <code>role</code>.
              </li>
            </ol>
          </div>
        )}

        <div className="admin-error-section">
          <h3>Quick checklist</h3>
          <ol>
            <li>
              Run <code>npm run db:up</code> in the repo root (PostgreSQL + SeaweedFS).
            </li>
            <li>
              Run <code>npm run db:migrate</code> and <code>npm run db:seed</code>.
            </li>
            <li>
              Run <code>npm run -w apps/backend dev</code> so port 8080 is serving the API.
            </li>
            <li>
              Sign in via Clerk with an account whose role row has <code>is_admin=true</code>.
            </li>
          </ol>
          <p className="muted small">
            The admin console reads live data — with the API up and a staff account in place, both tabs fill in.
          </p>
        </div>

        <footer>
          <button type="button" className="btn-primary" onClick={onRetry}>
            Retry
          </button>
        </footer>
      </div>
    </section>
  )
}

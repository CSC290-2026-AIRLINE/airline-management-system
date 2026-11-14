import type { ReactNode } from 'react'
import { Button } from '@staff-web/components/ui/button'
import { Card, CardContent } from '@staff-web/components/ui/card'
import { PAGE_CARD } from '../page-card'

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

function Code({ children }: { children: ReactNode }) {
  return <code className="rounded-sm bg-accent px-1.5 py-px font-mono text-xs">{children}</code>
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-4">
      <h3 className="mb-1.5 text-sm font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>
      {children}
    </div>
  )
}

/**
 * Friendly diagnostic shown when an admin API call fails. Surfaces the HTTP status (when known) and, only when the
 * request never reached the API, the setup steps the user can take to recover — replaces the small "Failed to load: …"
 * placeholder that page bodies used to render.
 */
export function AdminErrorCard({ page, error, status, onRetry }: AdminErrorCardProps) {
  const headline = status ? `${page} — HTTP ${status}` : `${page} failed to load`
  const isAuth = status === 401 || status === 403
  /* No HTTP status means the request got no answer at all — the API is not running, or the browser could not reach
     it. That is the only case where "start the database and the backend" is the right advice. A 403 or a 500 means
     the server did answer, and telling a signed-in admin to run `npm run db:up` is noise they have to scroll past. */
  const showSetup = status === undefined

  return (
    <Card className={PAGE_CARD}>
      <Card className="max-w-180 border-warning/40" role="alert">
        <CardContent className="px-7 max-phone:px-4">
          <header className="mb-3 flex items-center gap-3">
            <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-warning-soft text-base font-bold text-warning">
              !
            </span>
            <h2 className="m-0 text-base font-semibold text-foreground">{headline}</h2>
          </header>
          <p className="mb-4 text-xs break-words text-muted-foreground">{error ?? 'Unknown error'}</p>

          {isAuth && (
            <Section title="What this usually means">
              <ul className="list-disc pl-5 text-sm leading-relaxed text-muted-foreground">
                <li>Your session may have ended. Sign in again.</li>
                <li>Your role may not include administration. Ask an administrator to check your access.</li>
              </ul>
            </Section>
          )}

          {!isAuth && status !== undefined && (
            <Section title="What to try">
              <ul className="list-disc pl-5 text-sm leading-relaxed text-muted-foreground">
                <li>Retry. A failure on the server side is often temporary.</li>
                <li>If it keeps failing, tell the platform team and include the message above.</li>
              </ul>
            </Section>
          )}

          {showSetup && (
            <Section title="The server did not answer">
              <p className="text-sm leading-relaxed text-muted-foreground">
                Check your connection and retry. If it keeps happening, the service may be down.
              </p>
              <details className="mt-2 text-sm text-muted-foreground">
                <summary className="cursor-pointer font-medium text-foreground">Technical details (for developers)</summary>
                <ol className="mt-2 list-decimal pl-5 leading-relaxed">
                  <li>
                    Run <Code>npm run db:up</Code> in the repo root (PostgreSQL + SeaweedFS).
                  </li>
                  <li>
                    Run <Code>npm run db:migrate</Code> and <Code>npm run db:seed</Code>.
                  </li>
                  <li>
                    Run <Code>npm run -w apps/backend dev</Code> so port 8080 is serving the API.
                  </li>
                  <li>
                    Sign in with an account whose role has <Code>is_admin=true</Code>.
                  </li>
                </ol>
              </details>
            </Section>
          )}

          <footer className="mt-4">
            <Button size="sm" onClick={onRetry}>
              Retry
            </Button>
          </footer>
        </CardContent>
      </Card>
    </Card>
  )
}

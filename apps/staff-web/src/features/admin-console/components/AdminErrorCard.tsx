import type { ReactNode } from 'react'
import { Button } from '@staff-web/components/ui/button'
import { Card } from '@staff-web/components/ui/card'
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
  return <code className="rounded-sm bg-[#f3f4f6] px-1.5 py-px font-mono text-xs">{children}</code>
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-[18px]">
      <h3 className="mb-1.5 text-[13px] font-semibold tracking-[0.06em] text-[#6b7280] uppercase">{title}</h3>
      {children}
    </div>
  )
}

/**
 * Friendly diagnostic shown when an admin API call fails. Surfaces the HTTP status (when known) and the setup steps
 * the user can take to recover — replaces the small "Failed to load: …" placeholder that page bodies used to render.
 */
export function AdminErrorCard({ page, error, status, onRetry }: AdminErrorCardProps) {
  const headline = status ? `${page} — HTTP ${status}` : `${page} failed to load`
  const isAuth = status === 401 || status === 403

  return (
    <Card className={PAGE_CARD}>
      <div
        className="max-w-[720px] rounded-lg border border-[#fcd34d] border-l-4 border-l-[#f59e0b] px-7 py-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] max-phone:px-4"
        role="alert"
      >
        <header className="mb-3 flex items-center gap-3">
          <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-[#fef3c7] text-base font-bold text-[#92400e]">
            !
          </span>
          <h2 className="m-0 text-lg font-semibold text-[#111827]">{headline}</h2>
        </header>
        <p className="mb-4 text-xs break-words text-[#6b7280]">{error ?? 'Unknown error'}</p>

        {isAuth && (
          <Section title="This usually means one of two things">
            <ol className="list-decimal pl-5 text-sm leading-relaxed text-[#374151]">
              <li>You are not signed in to the staff app.</li>
              <li>
                Your signed-in account does not have <Code>is_admin=true</Code> on its <Code>role</Code>.
              </li>
            </ol>
          </Section>
        )}

        <Section title="Quick checklist">
          <ol className="list-decimal pl-5 text-sm leading-relaxed text-[#374151]">
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
              Sign in via Clerk with an account whose role row has <Code>is_admin=true</Code>.
            </li>
          </ol>
          <p className="mt-1 text-xs text-[#6b7280]">
            The admin console reads live data — with the API up and a staff account in place, both tabs fill in.
          </p>
        </Section>

        <footer className="mt-4">
          <Button size="sm" onClick={onRetry}>
            Retry
          </Button>
        </footer>
      </div>
    </Card>
  )
}

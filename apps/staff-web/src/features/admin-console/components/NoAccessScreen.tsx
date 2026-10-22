import type { ReactNode } from 'react'
import { StatusCard } from './StatusCard'

interface NoAccessScreenProps {
  /** The page the user tried to open, in the words a person would use — "Audit log", not `f15.audit_log`. */
  screenName: string
  /**
   * The user's role, e.g. "Finance Staff". When given, the copy explains which role the page is missing from; when
   * omitted the sentence falls back to the generic form.
   */
  roleName?: string
  /**
   * Set to false only if your guard does NOT write an `access_denied` row to `audit_log`. Leaving it true shows "This
   * attempt was recorded." and the badge's "logged in the audit log" — which is what the admin console's own pages
   * pass, because the access-denied path there does record it.
   */
  recorded?: boolean
  /** Where "Go to Home" navigates. Defaults to the app root. */
  homeTo?: string
  /** Rendered above the card — usually the feature's own shell, so the sidebar stays visible. */
  children?: ReactNode
}

/**
 * The "you don't have access" screen every feature shares. It answers the user's question ("why can't I open this,
 * and what do I do now?") instead of leaking an HTTP status, and it replaces the page body entirely — the feature's
 * own content must not render behind it.
 *
 * This component writes nothing. Recording the attempt is the guard's job: if your `beforeLoad` denies a user, write
 * an `access_denied` row to `audit_log` (see `contracts/README.md`) and then render this. Keeping the write on the
 * backend means the actor is read from the token, so a caller can never record a denial against somebody else.
 *
 * Typical use inside a feature route:
 *
 * ```tsx
 * const { loading, canOpen } = useScreenAccess()
 * if (loading) return <p className="muted">Checking your access…</p>
 * if (!canOpen('f07.refunds')) return <NoAccessScreen screenName="Refunds" roleName="Gate agent" />
 * return <RefundsPage />
 * ```
 */
export function NoAccessScreen({ screenName, roleName, recorded = true, homeTo = '/', children }: NoAccessScreenProps) {
  return (
    <StatusCard
      icon={
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="4" y="10.5" width="16" height="10.5" rx="2.5" />
          <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
          <circle cx="12" cy="15.5" r="1.4" fill="currentColor" stroke="none" />
        </svg>
      }
      title="You don't have access to this page"
      body={
        roleName
          ? `${screenName} isn't part of the ${roleName} role. Ask an Admin if you need it.`
          : `Your role can't open ${screenName}. Ask an Admin if you need it.`
      }
      /* Its own line rather than a trailing sentence — it is a statement about what just happened, not part of the
         explanation, and folding it in made the card far too wide to hold the first line unbroken. */
      note={recorded ? 'This attempt was recorded.' : undefined}
      badgeKey="FORBIDDEN"
      badgeDetail={recorded ? ' · logged in the audit log' : undefined}
      action={{ label: 'Go to Home', href: homeTo }}
    >
      {children}
    </StatusCard>
  )
}

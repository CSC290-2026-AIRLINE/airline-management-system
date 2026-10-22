import type { ReactNode } from 'react'
import './StatusCard.css'

interface StatusCardProps {
  /** Decorative — the screen reader already gets the heading, so this is hidden from it. */
  icon: ReactNode
  title: string
  /** The explanation. Keep it to one or two sentences. */
  body: ReactNode
  /**
   * Optional line under the body — used for "This attempt was recorded." when the screen's caller did write an
   * `audit_log` row. Omit it (and `badgeDetail`) when nothing was recorded, so the card never claims otherwise.
   */
  note?: string
  /** The machine-readable reason in the badge, e.g. `FORBIDDEN` or `STAFF_NOT_PROVISIONED`. */
  badgeKey: string
  /** Trailing badge text, e.g. `' · logged in the audit log'`. */
  badgeDetail?: string
  action: { label: string; href: string }
  /**
   * Rendered above the card — usually the feature's own shell, so the sidebar stays visible. Note that the wrapper
   * centres whatever children it is given too, so pass only block-level chrome.
   */
  children?: ReactNode
}

/**
 * The shared "you can't do this here" card: icon, headline, explanation, a machine-readable badge, and one action.
 *
 * Both access states in this feature use it — `NoAccessScreen` (signed in, but the role doesn't hold the screen) and
 * `StaffNotProvisionedScreen` (signed in, but nobody created a staff account). They look identical on purpose: a user
 * who hits either one should get the same shape, so the only thing that changes is the words.
 *
 * Self-contained like `NoAccessScreen` was: it imports its own CSS and never reaches for a page's styles or the app's
 * colour tokens, so a feature team can drop either screen into their route without dragging our shell along. That
 * costs one extra click on "Go to Home" — a plain `<a href>` rather than TanStack's `<Link>`, whose `to` prop is typed
 * against the generated route tree and would fail a type-check for routes that do not exist yet.
 */
export function StatusCard({ icon, title, body, note, badgeKey, badgeDetail, action, children }: StatusCardProps) {
  return (
    <div className="status-wrap">
      {children}
      <section className="status-card" role="alert" aria-live="polite">
        <span className="status-icon" aria-hidden="true">
          {icon}
        </span>

        <h2>{title}</h2>
        <p className="status-body">{body}</p>

        {note && <p className="status-note">{note}</p>}

        <p className="status-badge">
          <span className="status-badge-key">{badgeKey}</span>
          {badgeDetail && <span>{badgeDetail}</span>}
        </p>

        {/* Its own flex row so the button always starts a new line below the badge — as inline-level siblings the two
            would share one line and collide once the badge gets long. */}
        <div className="status-actions">
          <a className="status-action" href={action.href}>
            {action.label}
          </a>
        </div>
      </section>
    </div>
  )
}

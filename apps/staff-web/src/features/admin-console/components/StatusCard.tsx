import type { ReactNode } from 'react'
import { Button } from '@staff-web/components/ui/button'

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
 * Self-contained: styled with Tailwind utilities only, never with a page's styles, so a feature team can drop either
 * screen into their route without dragging our shell along. That costs one extra click on "Go to Home" — a plain
 * `<a href>` rather than TanStack's `<Link>`, whose `to` prop is typed against the generated route tree and would fail
 * a type-check for routes that do not exist yet.
 */
export function StatusCard({ icon, title, body, note, badgeKey, badgeDetail, action, children }: StatusCardProps) {
  return (
    <div data-slot="status-wrap" className="flex min-h-full items-center justify-center px-6 py-12">
      {children}
      <section
        className="w-full max-w-[716px] rounded-2xl border border-line bg-white px-12 pt-14 pb-11 text-center shadow-[0_4px_16px_rgba(15,23,42,0.06)] max-phone:px-6 max-phone:pt-10 max-phone:pb-8"
        role="alert"
        aria-live="polite"
      >
        <span className="inline-flex size-[72px] items-center justify-center rounded-full bg-[#fdeaea] text-[#dc2626]" aria-hidden="true">
          {icon}
        </span>

        <h2 className="mx-0 mt-6 mb-2 font-sans text-[26px] leading-tight font-bold text-[#111827]">{title}</h2>
        <p className="mb-[18px] text-sm leading-relaxed text-[#6b7280] max-[880px]:text-[13px]">{body}</p>

        {note && <p className="-mt-2.5 mb-[18px] text-sm leading-relaxed text-[#9ca3af] max-[880px]:text-[13px]">{note}</p>}

        <p className="mb-7 inline-block rounded-md bg-[#f1f3f6] px-2.5 py-1 font-mono text-xs text-[#6b7280]">
          <span className="font-semibold text-[#0e7490]">{badgeKey}</span>
          {badgeDetail && <span>{badgeDetail}</span>}
        </p>

        {/* Its own flex row so the button always starts a new line below the badge — as inline-level siblings the two
            would share one line and collide once the badge gets long. */}
        <div className="flex justify-center">
          <Button asChild className="h-auto rounded-lg bg-[#0e1b3d] px-7 py-3 text-sm font-semibold hover:bg-[#16295a]">
            <a href={action.href}>{action.label}</a>
          </Button>
        </div>
      </section>
    </div>
  )
}

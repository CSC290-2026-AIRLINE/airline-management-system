import type { ReactNode } from 'react'
import { Button } from '@staff-web/components/ui/button'
import { Card, CardContent } from '@staff-web/components/ui/card'

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
    <div data-slot="status-wrap" data-access-denied="" className="flex min-h-full flex-auto items-center justify-center px-6 py-12">
      {children}
      <Card className="w-full max-w-179 text-center" role="alert">
        <CardContent className="px-12 py-8 max-phone:px-6">
          <span className="inline-flex size-18 items-center justify-center rounded-full bg-danger-soft text-danger" aria-hidden="true">
            {icon}
          </span>

          <h2 className="mx-0 mt-6 mb-2 font-sans text-2xl leading-tight font-bold text-foreground">{title}</h2>
          <p className="mb-4 text-sm leading-relaxed text-muted-foreground max-laptop:text-sm">{body}</p>

          {note && <p className="-mt-2.5 mb-4 text-sm leading-relaxed text-foreground max-laptop:text-sm">{note}</p>}

          <p className="mb-7 inline-block rounded-md bg-accent px-2.5 py-1 font-mono text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{badgeKey}</span>
            {badgeDetail && <span>{badgeDetail}</span>}
          </p>

          {/* Its own flex row so the button always starts a new line below the badge — as inline-level siblings the two
            would share one line and collide once the badge gets long. */}
          <div className="flex justify-center">
            <Button asChild className="h-auto bg-primary px-7 py-3 text-sm hover:bg-navy-active">
              <a href={action.href}>{action.label}</a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

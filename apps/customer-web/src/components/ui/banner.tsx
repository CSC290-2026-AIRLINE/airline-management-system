import type { ReactNode } from 'react'
import { CircleAlertIcon, CircleCheckIcon, InfoIcon, TriangleAlertIcon, XIcon } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from './alert'
import { Button } from './button'
import { cn } from '@customer-web/lib/utils'

const kinds = {
  info: { variant: 'default', Icon: InfoIcon },
  success: { variant: 'success', Icon: CircleCheckIcon },
  warning: { variant: 'warning', Icon: TriangleAlertIcon },
  error: { variant: 'destructive', Icon: CircleAlertIcon },
} as const

/**
 * A banner (redesign board 7): a message about the whole page, on a tint, with an icon and a title so colour is never the
 * only signal. Say what happened and what to do next, in that order. One banner at a time above the content; field
 * errors stay with their field. Errors use role "alert" and the rest "status".
 */
export function Banner({
  kind = 'info',
  title,
  children,
  action,
  onDismiss,
  className,
}: {
  kind?: keyof typeof kinds
  title: ReactNode
  /** What to do next. */
  children?: ReactNode
  /** An optional action under the text, usually a secondary Button. */
  action?: ReactNode
  /** Shows a 44 px dismiss button. */
  onDismiss?: () => void
  className?: string
}) {
  const { variant, Icon } = kinds[kind]
  return (
    <Alert variant={variant} className={cn(onDismiss && 'pr-14', className)}>
      <Icon aria-hidden />
      <AlertTitle>{title}</AlertTitle>
      {children ? <AlertDescription>{children}</AlertDescription> : null}
      {action ? <div className="col-start-2 pt-2">{action}</div> : null}
      {onDismiss ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Dismiss"
          onClick={onDismiss}
          className="absolute top-0.5 right-0.5 text-foreground"
        >
          <XIcon />
        </Button>
      ) : null}
    </Alert>
  )
}

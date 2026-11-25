import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@customer-web/lib/utils'

/*
 * Message blocks on a tint (redesign board 7). Text is the body colour on the tint; only the icon takes the status
 * colour, so colour is never the only signal. `default` is the info kind. Prefer Banner for new code: it adds the icon,
 * the action and the dismiss button.
 */
const alertVariants = cva(
  'relative grid w-full grid-cols-[0_1fr] items-start gap-y-0.5 rounded-xl border px-4 py-3 text-sm text-foreground has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] has-[>svg]:gap-x-3 [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current',
  {
    variants: {
      variant: {
        default: 'border-info-line bg-info-tint [&>svg]:text-link',
        success: 'border-ok/25 bg-ok-tint [&>svg]:text-ok',
        warning: 'border-warn/25 bg-warn-tint [&>svg]:text-warn',
        destructive: 'border-danger/25 bg-danger-tint [&>svg]:text-destructive',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

function Alert({ className, variant, ...props }: React.ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
  // An error interrupts; the other kinds are announced politely.
  return (
    <div
      data-slot="alert"
      role={variant === 'destructive' ? 'alert' : 'status'}
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  )
}

function AlertTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="alert-title" className={cn('col-start-2 min-h-4 font-semibold tracking-tight', className)} {...props} />
}

function AlertDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-description"
      className={cn('col-start-2 grid justify-items-start gap-1 text-sm text-copy [&_p]:leading-relaxed', className)}
      {...props}
    />
  )
}

export { Alert, AlertTitle, AlertDescription }

import { buttonVariants } from '@customer-web/components/ui/button'
import { cn } from '@customer-web/lib/utils'

/**
 * The booking pages' button styles, taken from the app's shadcn Button so links styled as buttons (`<Link>`) and real
 * buttons look the same as on every other page. Prefer `<Button>` in new code; these keep the class-name call sites.
 */
const controls = {
  primary: buttonVariants(),
  secondary: buttonVariants({ variant: 'outline' }),
  danger: buttonVariants({ variant: 'destructive' }),
  dangerOutline: cn(
    buttonVariants({ variant: 'outline' }),
    'border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive',
  ),
  link: cn(buttonVariants({ variant: 'link' }), 'h-auto p-0'),
  action: buttonVariants({ variant: 'outline', size: 'sm' }),
}

export default controls

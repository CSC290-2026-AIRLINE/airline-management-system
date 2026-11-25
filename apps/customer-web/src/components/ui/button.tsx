import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2Icon } from 'lucide-react'
import { cn } from '@customer-web/lib/utils'
import { Slot } from 'radix-ui'

/*
 * The one button (redesign board 6). 44 px tall, 8 px radius, label in the body step at weight 600, one focus ring.
 * Four looks: primary (navy), secondary (white with a border), ghost (link blue on a tint) and destructive. A page has
 * one primary action. Orange is not a button colour.
 *
 * The older names stay so existing pages keep working: default and primary are the primary look, outline and tertiary the
 * secondary look, danger the destructive look.
 */
const primary =
  'bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-pressed disabled:bg-disabled disabled:text-control'
const secondary =
  'border-input bg-secondary text-secondary-foreground hover:border-navy hover:bg-muted active:border-navy active:bg-accent disabled:border-line disabled:bg-secondary disabled:text-control'
const destructive = 'bg-destructive text-white hover:bg-danger-hover active:bg-danger-pressed disabled:bg-disabled disabled:text-control'

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md border border-transparent text-base font-semibold whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none aria-busy:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: primary,
        primary,
        secondary,
        outline: secondary,
        tertiary: secondary,
        ghost: 'bg-transparent text-link hover:bg-accent active:bg-info-tint-pressed disabled:text-control',
        destructive,
        danger: destructive,
        'ghost-danger':
          'border-destructive bg-transparent text-destructive hover:bg-danger-tint disabled:border-line disabled:text-control',
        link: 'text-link underline-offset-4 hover:underline disabled:text-control',
      },
      size: {
        default: 'h-11 px-5 has-[>svg]:px-4',
        lg: 'h-11 px-6 has-[>svg]:px-5',
        // Compact: 36 px on a desktop table or toolbar, back to 44 px below 768 px.
        sm: 'h-11 gap-1.5 px-3 text-sm md:h-9',
        xs: "h-11 gap-1 px-2 text-xs md:h-7 [&_svg:not([class*='size-'])]:size-3",
        icon: 'size-11',
        'icon-lg': 'size-11',
        'icon-sm': 'size-11 md:size-9',
        'icon-xs': "size-11 md:size-7 [&_svg:not([class*='size-'])]:size-3",
        // Older F12 sizes, now on the same 44 px target.
        f12: 'h-11 gap-1.5 px-5 text-sm',
        pill: 'h-auto min-h-11 gap-1.5 rounded-full px-5 py-2 text-sm',
        block: 'h-11 w-full gap-1.5 px-5 text-sm',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  loading = false,
  children,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    /** Keeps the label (and so the width), shows a spinner, sets aria-busy and ignores clicks. Not available with asChild. */
    loading?: boolean
  }) {
  const common = {
    'data-slot': 'button',
    'data-variant': variant,
    'data-size': size,
    className: cn(buttonVariants({ variant, size, className })),
  }

  // Slot needs exactly one child, so the spinner only exists on the plain button.
  if (asChild) {
    return (
      <Slot.Root {...common} {...props}>
        {children}
      </Slot.Root>
    )
  }

  return (
    <button {...common} aria-busy={loading || undefined} {...props}>
      {loading ? <Loader2Icon className="animate-spin" aria-hidden /> : null}
      {children}
    </button>
  )
}

export { Button, buttonVariants }

import { mergeProps } from '@base-ui/react/merge-props'
import { useRender } from '@base-ui/react/use-render'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from 'cn'

const badgeVariants = cva(
  'group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-md border border-transparent px-2 py-0.5 text-xs font-bold whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground [a]:hover:bg-primary/80',
        secondary: 'bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80',
        destructive:
          'bg-destructive/10 text-destructive border-destructive/20 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:focus-visible:ring-destructive/40 [a]:hover:bg-destructive/20',
        // F12 success — green
        success: 'bg-[oklch(0.95_0.06_148)] text-[oklch(0.48_0.15_148)] border-[oklch(0.88_0.10_148)] [a]:hover:bg-[oklch(0.92_0.07_148)]',
        // F12 warning — amber (Figma --f12-amber)
        warning: 'bg-[oklch(0.96_0.05_85)] text-[oklch(0.45_0.12_60)] border-[oklch(0.88_0.10_85)] [a]:hover:bg-[oklch(0.93_0.06_85)]',
        // F12 pending — yellow (lighter than amber)
        pending: 'bg-[#fffaeb] text-[#b54708] border-[#fedf89] [a]:hover:bg-[#fef0c7]',
        // F12 cancelled — slate
        cancelled: 'bg-[#eef2f7] text-[#475569] border-[#dbe2ea] [a]:hover:bg-[#e2e8f0]',
        // F12 muted — neutral
        muted: 'bg-[#f5f5f7] text-[#525866] border-[#dbe2ea] [a]:hover:bg-[#ebebef]',
        outline: 'border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground',
        ghost: 'hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50',
        link: 'text-primary underline-offset-4 hover:underline',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

function Badge({
  className,
  variant = 'default',
  render,
  ...props
}: useRender.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: 'span',
    props: mergeProps<'span'>(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props,
    ),
    render,
    state: {
      slot: 'badge',
      variant,
    },
  })
}

export { Badge, badgeVariants }

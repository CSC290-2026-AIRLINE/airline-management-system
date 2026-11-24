import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@customer-web/lib/utils'
import { Tabs as TabsPrimitive } from 'radix-ui'

/*
 * Tabs (redesign board 7). Page sections use underline tabs: the active tab has a 2 px navy bar on the line under the row,
 * navy text and weight 600; each tab is 44 px tall and 28 px apart. On a phone the row scrolls sideways inside its own box.
 * Arrow keys move between tabs. `pill` is the grey segmented control, kept for choosing a filter or a view inside a page,
 * not for moving between sections. `line` is the old name for the underline look.
 */
function Tabs({ className, orientation = 'horizontal', ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      orientation={orientation}
      className={cn('group/tabs flex gap-2 data-[orientation=horizontal]:flex-col', className)}
      {...props}
    />
  )
}

const tabsListVariants = cva(
  'group/tabs-list text-muted-foreground group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col',
  {
    variants: {
      variant: {
        default: 'flex w-full items-end gap-7 overflow-x-auto border-b',
        line: 'flex w-full items-end gap-7 overflow-x-auto border-b',
        pill: 'inline-flex w-fit items-center justify-center rounded-lg bg-muted p-[3px] group-data-[orientation=horizontal]/tabs:h-9',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

function TabsList({
  className,
  variant = 'default',
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> & VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List data-slot="tabs-list" data-variant={variant} className={cn(tabsListVariants({ variant }), className)} {...props} />
  )
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        // Shared.
        "relative inline-flex shrink-0 items-center justify-center gap-1.5 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:text-control [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        // Underline (default and line): a 44 px target with the bar sitting on the line under the row.
        'min-h-11 px-0 text-muted-foreground hover:text-foreground data-[state=active]:font-semibold data-[state=active]:text-navy',
        'after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-navy after:opacity-0 after:transition-opacity data-[state=active]:after:opacity-100',
        // Pill: the grey segmented control.
        'group-data-[variant=pill]/tabs-list:h-[calc(100%-1px)] group-data-[variant=pill]/tabs-list:min-h-0 group-data-[variant=pill]/tabs-list:flex-1 group-data-[variant=pill]/tabs-list:rounded-md group-data-[variant=pill]/tabs-list:px-2 group-data-[variant=pill]/tabs-list:py-1 group-data-[variant=pill]/tabs-list:data-[state=active]:bg-background group-data-[variant=pill]/tabs-list:data-[state=active]:shadow-raised group-data-[variant=pill]/tabs-list:after:hidden',
        className,
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content data-slot="tabs-content" className={cn('flex-1 outline-none', className)} {...props} />
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }

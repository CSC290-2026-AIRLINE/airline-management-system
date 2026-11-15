import * as React from 'react'
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { DayPicker, getDefaultClassNames } from 'react-day-picker'
import { cn } from '@staff-web/lib/utils'

// shadcn Calendar over react-day-picker. The nav buttons are styled here, because this app's button.tsx does not export buttonVariants.
function Calendar({ className, classNames, showOutsideDays = true, ...props }: React.ComponentProps<typeof DayPicker>) {
  const d = getDefaultClassNames()
  const nav =
    'inline-flex size-8 items-center justify-center rounded-md p-0 text-foreground select-none hover:bg-accent hover:text-accent-foreground aria-disabled:opacity-50'
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn('bg-background p-3 text-sm', className)}
      classNames={{
        root: cn('w-fit', d.root),
        months: cn('relative flex flex-col gap-4 md:flex-row', d.months),
        month: cn('flex w-full flex-col gap-4', d.month),
        nav: cn('absolute inset-x-0 top-0 flex w-full items-center justify-between gap-1', d.nav),
        button_previous: cn(nav, d.button_previous),
        button_next: cn(nav, d.button_next),
        month_caption: cn('flex h-8 w-full items-center justify-center px-8', d.month_caption),
        caption_label: cn('text-sm font-medium select-none', d.caption_label),
        weekdays: cn('flex', d.weekdays),
        weekday: cn('flex-1 rounded-md text-[0.8rem] font-normal text-muted-foreground select-none', d.weekday),
        week: cn('mt-2 flex w-full', d.week),
        day: cn('group/day relative aspect-square h-full w-full p-0 text-center select-none', d.day),
        day_button: cn(
          'inline-flex size-8 items-center justify-center rounded-md font-normal hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
          d.day_button,
        ),
        selected: cn('[&>button]:bg-primary [&>button]:text-primary-foreground [&>button:hover]:bg-primary', d.selected),
        today: cn('[&>button]:bg-accent [&>button]:text-accent-foreground', d.today),
        outside: cn('text-muted-foreground opacity-60', d.outside),
        disabled: cn('text-muted-foreground opacity-50', d.disabled),
        hidden: cn('invisible', d.hidden),
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, className: c }) =>
          orientation === 'left' ? <ChevronLeftIcon className={cn('size-4', c)} /> : <ChevronRightIcon className={cn('size-4', c)} />,
      }}
      {...props}
    />
  )
}

export { Calendar }

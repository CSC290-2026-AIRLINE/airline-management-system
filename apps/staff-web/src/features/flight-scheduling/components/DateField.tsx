import { useState } from 'react'
import { format } from 'date-fns'
import { CalendarIcon } from 'lucide-react'
import { Button } from '@staff-web/components/ui/button'
import { Calendar } from '@staff-web/components/ui/calendar'
import { Label } from '@staff-web/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@staff-web/components/ui/popover'
import { cn } from '@staff-web/lib/utils'

// The API and the pages keep a date as 'YYYY-MM-DD'; these two keep it in local time, so a date never moves a day across a time zone.
const parse = (value: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : undefined
}

interface DatePickerProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  invalid?: boolean
  disabled?: boolean
  className?: string
  openAt?: string // the month to show when nothing is picked yet, as YYYY-MM-DD
  'aria-label'?: string
}

// A shadcn date picker: a Popover with a Calendar, in place of the native date input.
export function DatePicker({
  value,
  onChange,
  placeholder = 'Pick a date',
  invalid = false,
  disabled,
  className,
  openAt,
  ...rest
}: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const date = parse(value)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          aria-invalid={invalid}
          className={cn('w-full justify-start font-normal aria-invalid:border-destructive', !date && 'text-muted-foreground', className)}
          {...rest}
        >
          <CalendarIcon />
          {date ? format(date, 'dd MMM yyyy') : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          defaultMonth={date ?? parse(openAt ?? '')}
          onSelect={(next) => {
            onChange(next ? format(next, 'yyyy-MM-dd') : '')
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

interface DateFieldProps extends DatePickerProps {
  label: string
}

// Labelled DatePicker, like FormField.
export function DateField({ label, ...picker }: DateFieldProps) {
  return (
    <div className="flex flex-col items-start gap-1.5">
      <Label>{label}</Label>
      <DatePicker aria-label={label} {...picker} />
    </div>
  )
}

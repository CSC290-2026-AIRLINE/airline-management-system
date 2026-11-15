import { useState } from 'react'
import { CalendarIcon } from 'lucide-react'
import { Button } from '@customer-web/components/ui/button'
import { Calendar } from '@customer-web/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@customer-web/components/ui/popover'
import { cn } from '@customer-web/lib/utils'

type Props = {
  id?: string
  value: string
  onChange: (value: string) => void
  onError?: (message: string) => void
  describedBy?: string
  readOnly?: boolean
  disabled?: boolean
  today?: Date
}

const pad = (value: number) => String(value).padStart(2, '0')

/** The form keeps the date as `DD / MM / YYYY`, which `parseBirthDateInput` validates on submit. */
function toValue(date: Date) {
  return `${pad(date.getDate())} / ${pad(date.getMonth() + 1)} / ${date.getFullYear()}`
}

function toDate(value: string) {
  const match = /^(\d{2}) \/ (\d{2}) \/ (\d{4})$/.exec(value)
  return match ? new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1])) : undefined
}

/**
 * Date of birth picker, shared by the first sign-in page and the saved-passenger dialog so both pick and validate
 * identically. Future dates and years before 1900 cannot be selected. The caller validates that a date was chosen on submit.
 */
export default function BirthDateInput({
  id,
  value,
  onChange,
  onError,
  describedBy,
  readOnly = false,
  disabled = false,
  today = new Date(),
}: Props) {
  const [open, setOpen] = useState(false)
  const selected = toDate(value)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled || readOnly}
          aria-describedby={describedBy}
          className={cn('w-full justify-start font-normal', !value && 'text-muted-foreground')}
        >
          <CalendarIcon />
          {value || 'Select date'}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          captionLayout="dropdown"
          selected={selected}
          defaultMonth={selected ?? new Date(2000, 0)}
          startMonth={new Date(1900, 0)}
          endMonth={today}
          disabled={{ after: today }}
          onSelect={(date) => {
            if (!date) return
            onChange(toValue(date))
            onError?.('')
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

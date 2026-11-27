import { useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@staff-web/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@staff-web/components/ui/popover'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** The Finance prototype's year header and twelve-month grid; only computed months are selectable. */
export function BiMonthPicker({
  id,
  value,
  months,
  onChange,
}: {
  id: string
  value: string
  months: string[]
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [year, setYear] = useState(() => Number(value.slice(0, 4)) || new Date().getFullYear())
  const selectedYear = Number(value.slice(0, 4))
  const selectedMonth = Number(value.slice(5, 7))
  const label = value ? `${MONTHS[selectedMonth - 1]} ${selectedYear}` : 'No months yet'

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) setYear(selectedYear || new Date().getFullYear())
        setOpen(next)
      }}
    >
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          className="w-full justify-between font-normal sm:w-44"
          aria-label="Month"
          disabled={months.length === 0}
        >
          {label}
          <ChevronDown aria-hidden="true" className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className="w-72 max-w-[calc(100vw-2rem)] p-3.5" aria-label="Choose report month">
        <div className="mb-2.5 flex items-center justify-between">
          <Button type="button" variant="outline" size="icon-sm" aria-label="Previous year" onClick={() => setYear(year - 1)}>
            <ChevronLeft />
          </Button>
          <strong className="text-sm font-semibold" aria-live="polite">
            {year}
          </strong>
          <Button type="button" variant="outline" size="icon-sm" aria-label="Next year" onClick={() => setYear(year + 1)}>
            <ChevronRight />
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-1.5" role="group" aria-label={`Months in ${year}`}>
          {MONTHS.map((month, index) => {
            const key = `${year}-${String(index + 1).padStart(2, '0')}`
            return (
              <Button
                key={key}
                type="button"
                variant={value === key ? 'default' : 'outline'}
                className="h-10"
                aria-label={`${month} ${year}`}
                aria-pressed={value === key}
                disabled={!months.includes(key)}
                onClick={() => {
                  onChange(key)
                  setOpen(false)
                }}
              >
                {month}
              </Button>
            )
          })}
        </div>
        <p className="mt-2.5 text-[11px] text-muted-foreground">Greyed months have no report yet.</p>
      </PopoverContent>
    </Popover>
  )
}

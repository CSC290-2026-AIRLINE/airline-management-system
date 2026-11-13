import { useState } from 'react'
import { Popover } from 'radix-ui'
import { Button } from '@staff-web/components/ui/button'

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
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        if (next) setYear(selectedYear || new Date().getFullYear())
        setOpen(next)
      }}
    >
      <Popover.Trigger asChild>
        <Button id={id} type="button" variant="outline" className="bi-month-trigger" aria-label="Month" disabled={months.length === 0}>
          {label}
          <span aria-hidden="true">▾</span>
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="start" sideOffset={6} className="bi-month-popover" aria-label="Choose report month">
          <div className="bi-month-year">
            <Button type="button" variant="outline" aria-label="Previous year" onClick={() => setYear(year - 1)}>
              ‹
            </Button>
            <strong aria-live="polite">{year}</strong>
            <Button type="button" variant="outline" aria-label="Next year" onClick={() => setYear(year + 1)}>
              ›
            </Button>
          </div>
          <div className="bi-month-grid" role="group" aria-label={`Months in ${year}`}>
            {MONTHS.map((month, index) => {
              const key = `${year}-${String(index + 1).padStart(2, '0')}`
              return (
                <Button
                  key={key}
                  type="button"
                  variant="outline"
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
          <p>Greyed months have no report yet.</p>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

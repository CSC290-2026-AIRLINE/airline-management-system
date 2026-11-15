import { useState, type KeyboardEvent } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { Button } from '@staff-web/components/ui/button'
import { Input } from '@staff-web/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@staff-web/components/ui/popover'
import { cn } from '@staff-web/lib/utils'
import { nationalityLabel, nationalityOptions } from '../nationalities'

/** Searchable nationality picker: a popover with a filter box over the list of country codes. */
export function NationalitySelect({ value, onChange }: { value: string; onChange: (code: string) => void }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const term = query.trim().toLowerCase()
  const options = term ? nationalityOptions.filter((option) => option.search.includes(term)) : nationalityOptions

  function choose(code: string) {
    onChange(code)
    setOpen(false)
  }
  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (options.length) setActive((active + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      if (options[active]) choose(options[active].value)
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) {
          setQuery('')
          setActive(
            Math.max(
              0,
              nationalityOptions.findIndex((option) => option.value === value),
            ),
          )
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-label="Nationality"
          aria-expanded={open}
          className={cn('w-full justify-between font-normal', !value && 'text-muted-foreground')}
        >
          <span className="truncate">{nationalityLabel(value)}</span>
          <ChevronDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-64 p-2" align="start">
        <Input
          type="search"
          aria-label="Search nationality"
          placeholder="Search name or code"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setActive(0)
          }}
          onKeyDown={keyDown}
          autoFocus
        />
        <div role="listbox" aria-label="Nationalities" className="mt-2 max-h-56 overflow-y-auto">
          {!term && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              role="option"
              aria-selected={!value}
              className="w-full justify-start"
              onClick={() => choose('')}
            >
              <Check className={cn(value && 'opacity-0')} />
              Select nationality
            </Button>
          )}
          {options.map((option, index) => (
            <Button
              key={option.value}
              type="button"
              variant="ghost"
              size="sm"
              role="option"
              aria-selected={value === option.value}
              ref={(node) => {
                if (node && index === active) node.scrollIntoView({ block: 'nearest' })
              }}
              className={cn('w-full justify-start', index === active && 'bg-accent')}
              onClick={() => choose(option.value)}
              onMouseMove={() => setActive(index)}
            >
              <Check className={cn(value !== option.value && 'opacity-0')} />
              {option.label}
            </Button>
          ))}
          {!options.length && (
            <p role="status" className="px-2 py-3 text-sm text-muted-foreground">
              No nationality found.
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

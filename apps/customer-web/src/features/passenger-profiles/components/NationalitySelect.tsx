import { useRef, useState } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
import { Button } from '@customer-web/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@customer-web/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@customer-web/components/ui/popover'
import FormField from '@customer-web/features/passenger-profiles/components/FormField'
import { cn } from '@customer-web/lib/utils'
import { nationalityOptions, nationalitySearchText } from '../profile-api'

type Props = {
  value: string
  disabled?: boolean
  describedBy?: string
  onChange: (code: string) => void
}

/** Searchable nationality picker. The caller validates that a value was chosen when the form is submitted. */
export default function NationalitySelect({ value, disabled, describedBy = 'setup-lock-warning', onChange }: Props) {
  const [open, setOpen] = useState(false)
  const list = useRef<HTMLDivElement>(null)
  const label = nationalityOptions.find(([code]) => code === value)?.[1] ?? ''
  return (
    <FormField label="Nationality">
      {({ id }) => (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              id={id}
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={open}
              aria-describedby={describedBy}
              disabled={disabled}
              className="w-full justify-between font-normal"
            >
              <span className={cn('truncate', !label && 'text-muted-foreground')}>{label || 'Search nationality'}</span>
              <ChevronsUpDown className="opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
            <Command>
              <CommandInput placeholder="Search nationality" onValueChange={() => list.current?.scrollTo({ top: 0 })} />
              <CommandList ref={list}>
                <CommandEmpty>No match — try a country name, e.g. “United Kingdom”</CommandEmpty>
                <CommandGroup>
                  {nationalityOptions.map((option) => {
                    const [code, name, country] = option
                    return (
                      <CommandItem
                        key={code}
                        value={nationalitySearchText(option)}
                        onSelect={() => {
                          onChange(code)
                          setOpen(false)
                        }}
                      >
                        <Check className={cn(value === code ? 'opacity-100' : 'opacity-0')} />
                        {name}
                        {country !== name && <span className="ml-auto text-xs text-muted-foreground">{country}</span>}
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      )}
    </FormField>
  )
}

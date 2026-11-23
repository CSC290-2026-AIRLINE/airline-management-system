// "Who is this for?" picker. One chip per passenger; the active chip
// shows a dark border + filled avatar. The subtitle under each name
// shows the passenger's current choice (or "Default meal" if they
// haven't picked anything yet).

import { Avatar, AvatarFallback } from '@customer-web/components/ui/avatar'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@customer-web/components/ui/card'
import { cn } from '@customer-web/lib/utils'
import type { Cart, PassengerRef } from './types'

interface Props {
  passengers: PassengerRef[]
  cart: Cart
  selectedId: string
  onSelect: (passengerId: string) => void
}

// Subtitle shown under the passenger's name in the chip. We only show
// the meal line (a passenger without a meal line is on the cabin's
// default meal). Snacks/drinks/duty-free lines are summarised in the
// trailing "+N item(s)" suffix so the customer can see at a glance how
// much the passenger is getting beyond the meal.
function subtitleFor(passengerId: string, cart: Cart): string {
  const lines = cart[passengerId] ?? []
  const mealLine = lines.find((l) => l.category === 'meal')
  const addonCount = lines.filter((l) => l.category !== 'meal').reduce((sum, l) => sum + l.quantity, 0)
  const addonSuffix = addonCount > 0 ? ` · +${addonCount} ${addonCount === 1 ? 'item' : 'items'}` : ''
  if (!mealLine) return `Default meal${addonSuffix}`
  return `${mealLine.productName}${addonSuffix}`
}

export function PassengerPicker({ passengers, cart, selectedId, onSelect }: Props) {
  return (
    <Card aria-labelledby="f12-picker-heading" className="gap-4">
      <CardHeader>
        <CardTitle id="f12-picker-heading">Who is this for?</CardTitle>
        <CardDescription>Select a passenger first. Meals, snacks, drinks and duty-free are added per passenger.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Passenger">
          {passengers.map((p) => {
            const isActive = p.id === selectedId
            const initial = p.firstName.charAt(0).toUpperCase() || '?'
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={isActive}
                className={cn(
                  'flex min-w-0 cursor-pointer items-center gap-3 rounded-lg border bg-card px-3 py-2.5 text-left transition-colors outline-none',
                  'hover:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
                  isActive && 'border-primary ring-1 ring-primary',
                )}
                onClick={() => onSelect(p.id)}
              >
                <Avatar className="size-9 shrink-0">
                  <AvatarFallback className={cn('font-semibold', isActive && 'bg-primary text-primary-foreground')}>
                    {initial}
                  </AvatarFallback>
                </Avatar>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium">{p.firstName}</span>
                  <span className={cn('truncate text-xs', isActive ? 'font-medium text-primary' : 'text-muted-foreground')}>
                    {subtitleFor(p.id, cart)}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

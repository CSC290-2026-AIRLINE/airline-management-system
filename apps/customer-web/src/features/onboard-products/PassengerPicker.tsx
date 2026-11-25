// "Who is this for?" picker. One chip per passenger; the active chip
// shows a dark border + filled avatar. The subtitle under each name
// shows the meal in the cart, else the meal already ordered on this
// flight, else what happens without one: "Default meal" in a
// complimentary cabin, "No pre-order" in a paid one.

import { SelectTile } from '@customer-web/components/ui/select-tile'
import { Avatar, AvatarFallback } from '@customer-web/components/ui/avatar'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@customer-web/components/ui/card'
import { cn } from '@customer-web/lib/utils'
import type { CabinSetting, Cart, PassengerRef } from './types'

interface Props {
  passengers: PassengerRef[]
  cart: Cart
  // Meal already ordered on this flight, by passenger id (product name).
  orderedMeals: Record<string, string>
  mealService: CabinSetting['mealService'] | null
  selectedId: string
  onSelect: (passengerId: string) => void
}

// Subtitle shown under the passenger's name in the chip. We only show
// the meal line (a passenger without a meal line is on the cabin's
// default meal). Snacks/drinks/duty-free lines are summarised in the
// trailing "+N item(s)" suffix so the customer can see at a glance how
// much the passenger is getting beyond the meal.
function subtitleFor(
  passengerId: string,
  cart: Cart,
  orderedMeals: Record<string, string>,
  mealService: CabinSetting['mealService'] | null,
): string {
  const lines = cart[passengerId] ?? []
  const mealLine = lines.find((l) => l.category === 'meal')
  const addonCount = lines.filter((l) => l.category !== 'meal').reduce((sum, l) => sum + l.quantity, 0)
  const addonSuffix = addonCount > 0 ? ` · +${addonCount} ${addonCount === 1 ? 'item' : 'items'}` : ''
  if (mealLine) return `${mealLine.productName}${addonSuffix}`
  const ordered = orderedMeals[passengerId]
  if (ordered) return `${ordered} (ordered)${addonSuffix}`
  if (mealService === 'none') return addonSuffix ? addonSuffix.slice(3) : 'No meal service'
  return `${mealService === 'paid' ? 'No pre-order' : 'Default meal'}${addonSuffix}`
}

export function PassengerPicker({ passengers, cart, orderedMeals, mealService, selectedId, onSelect }: Props) {
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
              <SelectTile
                key={p.id}
                role="radio"
                aria-checked={isActive}
                selected={isActive}
                className="min-w-0 items-center gap-3 px-3 py-2.5"
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
                    {subtitleFor(p.id, cart, orderedMeals, mealService)}
                  </span>
                </span>
              </SelectTile>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

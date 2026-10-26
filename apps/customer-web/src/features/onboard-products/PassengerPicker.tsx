// "Who is this for?" picker. One chip per passenger; the active chip
// shows a dark border + filled avatar. The subtitle under each name
// shows the passenger's current choice (or "Default meal" if they
// haven't picked anything yet).

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
    <section
      className="bg-card border border-border rounded-2xl p-5 shadow-[0_12px_32px_rgba(15,26,51,0.08)] mt-4 overflow-hidden"
      aria-labelledby="f12-picker-heading"
    >
      <h3 id="f12-picker-heading" className="font-semibold text-foreground text-base m-0 mb-1 tracking-[-0.1px]">
        Who is this for?
      </h3>
      <p className="m-0 mb-4 text-muted-foreground text-sm leading-relaxed">
        Select a passenger first. Meals, snacks, drinks and duty-free are added per passenger.
      </p>
      <div
        className="grid gap-3 mt-4"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}
        role="radiogroup"
        aria-label="Passenger"
      >
        {passengers.map((p) => {
          const isActive = p.id === selectedId
          const initial = p.firstName.charAt(0).toUpperCase() || '?'
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={isActive}
              data-active={isActive}
              className="flex items-center gap-3 bg-white border border-border rounded-lg cursor-pointer font-sans text-left px-3 py-2.5 transition-colors hover:border-[#98a2b3] focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 data-[active=true]:border-foreground data-[active=true]:shadow-[inset_0_0_0_1px_#101828]"
              onClick={() => onSelect(p.id)}
            >
              <span
                className="inline-flex items-center justify-center w-9 h-9 rounded-full text-white font-semibold text-sm tracking-[0.4px] flex-none"
                style={{
                  background: isActive ? 'linear-gradient(135deg, #101828, #1d2939)' : 'linear-gradient(135deg, #6b8afd, #8b6bfd)',
                }}
                aria-hidden="true"
              >
                {initial}
              </span>
              <span className="flex flex-col min-w-0">
                <span className="text-foreground text-[15px] font-medium whitespace-nowrap overflow-hidden text-ellipsis">
                  {p.firstName}
                </span>
                <span
                  className={
                    isActive
                      ? 'text-[#1d4ed8] text-xs font-medium mt-0.5 whitespace-nowrap overflow-hidden text-ellipsis'
                      : 'text-muted-foreground text-xs mt-0.5 whitespace-nowrap overflow-hidden text-ellipsis'
                  }
                >
                  {subtitleFor(p.id, cart)}
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

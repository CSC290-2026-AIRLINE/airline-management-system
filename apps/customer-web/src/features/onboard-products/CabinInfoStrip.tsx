// Single-line text strip below the banner that describes the cabin's
// meal policy for the selected flight. Mirrors the Figma copy
// ("Meals on this flight: {service}. {description}").

import type { CabinSetting } from './types'

interface Props {
  setting: CabinSetting
}

function ledeFor(setting: CabinSetting): string {
  switch (setting.mealService) {
    case 'complimentary':
      return 'One meal per passenger is included. Extra food costs money, also on board. Halal and vegetarian options are marked on the menu.'
    case 'paid':
      return 'Meals on this flight are not included. You can pre-order from the menu below — every line is charged.'
    case 'none':
      return 'No meal service on this flight. Snacks and drinks are still available below.'
  }
}

export function CabinInfoStrip({ setting }: Props) {
  return (
    <div className="m-0 px-4 py-3 bg-card border border-border rounded-lg text-foreground text-sm leading-relaxed">
      <strong className="font-semibold whitespace-nowrap">Meals on this flight: {setting.mealService}.</strong> {ledeFor(setting)}
    </div>
  )
}

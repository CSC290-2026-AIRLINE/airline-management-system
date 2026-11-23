// The cabin's meal policy for the selected flight ("Meals on this flight: {service}. {description}").

import { Alert, AlertDescription } from '@customer-web/components/ui/alert'
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
    <Alert>
      <AlertDescription className="col-start-2 text-foreground">
        <span>
          <strong className="font-semibold">Meals on this flight: {setting.mealService}.</strong> {ledeFor(setting)}
        </span>
      </AlertDescription>
    </Alert>
  )
}

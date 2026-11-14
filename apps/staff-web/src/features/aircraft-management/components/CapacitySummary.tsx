import { CardTitle } from '@staff-web/components/ui/card'
import { CABIN_CLASS_NAMES, type CabinCapacity } from '../cabin'

interface CapacitySummaryProps {
  total: number
  blocked: number
  sellable: number
  perCabin: CabinCapacity[]
}

/** The seat counts of a layout: the totals, then the seats of each cabin. */
export function CapacitySummary({ total, blocked, sellable, perCabin }: CapacitySummaryProps) {
  return (
    <>
      <CardTitle>Capacity summary</CardTitle>
      <div className="f9-metrics">
        <div className="f9-metric">
          <div className="f9-metric__label">TOTAL SEATS</div>
          <div className="f9-metric__value">{total}</div>
        </div>
        <div className="f9-metric">
          <div className="f9-metric__label">BLOCKED</div>
          <div className="f9-metric__value f9-metric__value--red">{blocked}</div>
        </div>
        <div className="f9-metric">
          <div className="f9-metric__label">SELLABLE</div>
          <div className="f9-metric__value f9-metric__value--green">{sellable}</div>
        </div>
      </div>
      {perCabin.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm" aria-label="Seats per cabin">
          {perCabin.map((cabin, index) => (
            <li key={`${cabin.cabin_class}-${index}`} className="flex justify-between gap-4">
              <span className="text-muted-foreground">{CABIN_CLASS_NAMES[cabin.cabin_class]}</span>
              <span className="font-medium">
                {cabin.seats} seats · {cabin.blocked} blocked · {cabin.sellable} sellable
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

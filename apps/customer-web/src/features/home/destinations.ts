import chiangMai from './assets/chiang-mai.jpg'
import hanoi from './assets/hanoi.jpg'
import phuket from './assets/phuket.jpg'
import tokyo from './assets/tokyo.jpg'

export interface Destination {
  /** IATA code of the arrival airport. A card is only shown when the search API has a fare to it. */
  code: string
  city: string
  country: string
  image: string
}

export const DESTINATIONS: Destination[] = [
  { code: 'CNX', city: 'Chiang Mai', country: 'Thailand', image: chiangMai },
  { code: 'HKT', city: 'Phuket', country: 'Thailand', image: phuket },
  { code: 'HAN', city: 'Hanoi', country: 'Vietnam', image: hanoi },
  { code: 'NRT', city: 'Tokyo', country: 'Japan', image: tokyo },
]

export function formatMoney(value: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, currencyDisplay: 'code', maximumFractionDigits: 0 }).format(value)
}

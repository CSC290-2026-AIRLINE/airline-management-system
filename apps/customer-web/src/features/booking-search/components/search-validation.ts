import type { FlightSearchFormValue } from './contracts'

function today() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function validateSearch(value: FlightSearchFormValue): string | null {
  if (value.adults + value.children < 1 || value.adults + value.children > 9) return 'Choose between 1 and 9 adults and children.'
  if (value.infants > value.adults) return 'Each lap infant must travel with a different adult.'
  for (const [index, leg] of value.legs.entries()) {
    if (!/^[A-Z]{3}$/.test(leg.origin) || !/^[A-Z]{3}$/.test(leg.destination))
      return `Enter three-letter airport codes for leg ${index + 1}.`
    if (leg.origin === leg.destination) return `Choose different airports for leg ${index + 1}.`
    if (!leg.date || leg.date < today()) return `Choose today or a future date for leg ${index + 1}.`
    if (index > 0 && leg.date < value.legs[index - 1].date) return 'Flight dates must be in travel order.'
  }
  return null
}

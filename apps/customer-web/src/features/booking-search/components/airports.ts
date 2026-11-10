export interface Airport {
  code: string
  city: string
  name: string
}

// The demo network the backend seeds (apps/backend/src/db/seed.ts). There is no airports API yet,
// so this list is the source of truth for the labels the customer sees. Keep it in sync with the seed.
export const AIRPORTS: Airport[] = [
  { code: 'BKK', city: 'Bangkok', name: 'Suvarnabhumi' },
  { code: 'CNX', city: 'Chiang Mai', name: 'Chiang Mai' },
  { code: 'HKT', city: 'Phuket', name: 'Phuket' },
]

export function airportLabel(code: string): string {
  const airport = AIRPORTS.find((candidate) => candidate.code === code)
  if (!airport) return code
  return `${airport.city} (${airport.code})`
}

export function airportCity(code: string): string {
  return AIRPORTS.find((candidate) => candidate.code === code)?.city ?? code
}

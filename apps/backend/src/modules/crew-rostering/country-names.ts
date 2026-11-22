/**
 * Display names for the countries Feature 8 shows, keyed by upper-case ISO code. The database
 * stores the code in lower case (`th`, matching `airport.country`), so look names up through
 * `countryName`, which accepts either case and falls back to the upper-case code.
 */
export const COUNTRY_CODES: Readonly<Record<string, string>> = {
  AU: 'Australia',
  CN: 'China',
  DE: 'Germany',
  FR: 'France',
  GB: 'United Kingdom',
  ID: 'Indonesia',
  IN: 'India',
  JP: 'Japan',
  KR: 'South Korea',
  MY: 'Malaysia',
  NZ: 'New Zealand',
  SG: 'Singapore',
  TH: 'Thailand',
  US: 'United States',
  VN: 'Vietnam',
}

export function countryName(code: string): string {
  return COUNTRY_CODES[code.toUpperCase()] ?? code.toUpperCase()
}

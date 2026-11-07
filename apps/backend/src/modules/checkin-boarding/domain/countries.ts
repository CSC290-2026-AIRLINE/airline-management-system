const ALPHA2 = new Map<string, string>([
  ['THA', 'th'],
  ['JPN', 'jp'],
  ['KOR', 'kr'],
  ['CHN', 'cn'],
  ['IND', 'in'],
  ['USA', 'us'],
  ['GBR', 'gb'],
  ['DEU', 'de'],
  ['D', 'de'], // ICAO 9303 allows the three-letter code to be shortened to one
  ['FRA', 'fr'],
  ['SWE', 'se'],
  ['SGP', 'sg'],
  ['MYS', 'my'],
  ['VNM', 'vn'],
  ['AUS', 'au'],
  ['CAN', 'ca'],
  ['NLD', 'nl'],
  ['ITA', 'it'],
  ['ESP', 'es'],
  ['RUS', 'ru'],
  ['UTO', 'ut'], // ICAO specimen passport, not a real country
])

/** Maps an ISO 3166-1 alpha-3 (or the ICAO 'D' shortcut) to the team's lower-case alpha-2 code. */
export function toAlpha2(code3: string): string | null {
  return ALPHA2.get(code3.toUpperCase()) ?? null
}

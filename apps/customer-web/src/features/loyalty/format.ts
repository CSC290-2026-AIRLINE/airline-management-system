const number = new Intl.NumberFormat('en-GB')
const signed = new Intl.NumberFormat('en-GB', { signDisplay: 'exceptZero' })
const date = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const tableDate = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })

export const formatMiles = (miles: number) => number.format(miles)
// Typographic minus, as in the designs.
export const formatSignedMiles = (miles: number) => signed.format(miles).replace('-', '−')
export const formatDate = (iso: string) => date.format(new Date(iso))
export const formatTableDate = (iso: string) => tableDate.format(new Date(iso))

// yyyy-mm-dd for <input type="date">, in UTC like every date on these pages.
export const toDateInput = (iso: string) => iso.slice(0, 10)

export function minusMonths(iso: string, months: number) {
  const d = new Date(iso)
  d.setUTCMonth(d.getUTCMonth() - months)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString()
}

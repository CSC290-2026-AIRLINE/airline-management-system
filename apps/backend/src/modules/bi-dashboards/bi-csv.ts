/**
 * RFC 4180 CSV: fields containing a comma, quote or line break are wrapped in quotes, and quotes are doubled. Numbers
 * are written as plain values with no thousands separators, so a spreadsheet reads them as numbers.
 */
export function toCsv(header: string[], rows: (string | number | null)[][]): string {
  const lines = [header, ...rows].map((row) => row.map(csvField).join(','))
  return `${lines.join('\r\n')}\r\n`
}

function csvField(value: string | number | null): string {
  if (value === null) return ''
  const text = String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

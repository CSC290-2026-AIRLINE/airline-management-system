/** Format an 11-digit Air Waybill number as 999-1234567-5. */
export function fmtAwb(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 10)}-${digits.slice(10)}`
  return raw
}

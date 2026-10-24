/** Small formatting helpers the crew rostering services share. */

/** `P. Thongdee`: first initial and last name, as the roster prints a person. */
export function shortName(member: { first_name: string; last_name: string }): string {
  return `${member.first_name.charAt(0)}. ${member.last_name}`
}

/** `YYYY-MM-DD` in UTC. */
export function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10)
}

/** `YYYY-MM-DD` of an instant on the wall clock of an IANA time zone. */
export function localDay(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant)
}

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

/** `HH:mm` of an instant on the wall clock of an IANA time zone. */
export function localTime(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(instant)
}

/**
 * Whether the time between one leg's arrival and the next leg's departure is a rest, that is,
 * at least `minRestHours` from release (arrival plus `releaseMinutes`) to the next report
 * (departure minus `reportMinutes`). Legs without a rest between them belong to one duty.
 */
export function isRestBetween(
  arrival: Date,
  nextDeparture: Date,
  reportMinutes: number,
  releaseMinutes: number,
  minRestHours: number,
): boolean {
  const released = arrival.getTime() + releaseMinutes * 60_000
  const reported = nextDeparture.getTime() - reportMinutes * 60_000
  return reported - released >= minRestHours * 3_600_000
}

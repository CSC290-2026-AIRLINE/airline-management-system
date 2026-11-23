// UTC, to match the case history and the labels the backend writes.
const DATE_TIME = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
})

export function formatDateTime(iso: string): string {
  return DATE_TIME.format(new Date(iso))
}

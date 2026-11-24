// Bangkok time, the airline's home time zone, to match the labels the backend writes.
const DATE_TIME = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Bangkok',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

export function formatDateTime(iso: string): string {
  return DATE_TIME.format(new Date(iso))
}

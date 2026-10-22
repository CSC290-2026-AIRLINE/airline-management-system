export const listTypes = { wanted: 'Wanted', travel_ban: 'Travel ban', no_fly: 'No-fly' } as const
export type ListType = keyof typeof listTypes
export type EntryStatus = 'active' | 'cleared'

export interface EntryFields {
  firstName: string
  lastName: string
  dateOfBirth: string
  nationality: string // Lowercase alpha-2 country code, or empty when unspecified.
  passportNumber: string
  listType: ListType
  issuingAuthority: string
  reason: string
}

export interface WatchlistEntry extends EntryFields {
  id: string
  status: EntryStatus
  listedAt: string
  clearReason?: string
  clearedAt?: string
}

export const entryName = (entry: EntryFields) => `${entry.firstName} ${entry.lastName}`
export const maskedPassport = (value: string) => (value ? `•••• ${value.slice(-4)}` : '—')
export const formatDate = (value: string) =>
  value
    ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
        .format(new Date(value))
        .replace('Sept', 'Sep')
    : '—'

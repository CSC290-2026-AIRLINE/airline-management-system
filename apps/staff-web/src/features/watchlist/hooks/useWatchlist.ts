import { useEffect, useState } from 'react'
import { entryName, type EntryFields, type EntryStatus, type ListType, type WatchlistEntry } from '../watchlist.types'

// UI fixtures only; DEMO-prefixed passports are synthetic full values, masked only for display.
// Replace this hook's data source when the Watchlist API is available.
const fixtures: WatchlistEntry[] = [
  ['1', 'SOMSAK', 'JAIDEE', '1985-07-02', 'th', 'DEMO9037', 'wanted', 'active', '2026-03-14'],
  ['2', 'ARTHIT', 'WONGSA', '1979-11-19', 'th', 'DEMO1164', 'travel_ban', 'active', '2026-02-02'],
  ['3', 'MAYA', 'KORN', '1990-04-30', 'mm', 'DEMO5520', 'no_fly', 'active', '2026-01-21'],
  ['4', 'PREECHA', 'SUKSAN', '1972-09-07', 'th', 'DEMO3398', 'wanted', 'active', '2025-12-05'],
  ['5', 'LIN', 'THU', '1988-06-11', 'mm', 'DEMO7701', 'travel_ban', 'cleared', '2025-08-18'],
  ['6', 'NATT', 'CHAIYA', '1983-12-25', 'th', 'DEMO2045', 'wanted', 'cleared', '2025-06-03'],
].map(([id, firstName, lastName, dateOfBirth, nationality, passportNumber, listType, status, listedAt]) => ({
  id,
  firstName,
  lastName,
  dateOfBirth,
  nationality,
  passportNumber,
  listType: listType as ListType,
  status: status as EntryStatus,
  listedAt,
  issuingAuthority: '[Demo authority]',
  reason: 'Demo case 2026-014',
}))

export function useWatchlist() {
  const [entries, setEntries] = useState(fixtures)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<EntryStatus | 'all'>('active')
  const [listType, setListType] = useState<ListType | 'all'>('all')
  const [message, setMessage] = useState('')
  useEffect(() => {
    if (!message) return
    const timeout = window.setTimeout(() => setMessage(''), 5000)
    return () => window.clearTimeout(timeout)
  }, [message])
  const search = query.trim().toLowerCase()
  const visibleEntries = entries.filter(
    (entry) =>
      (status === 'all' || entry.status === status) &&
      (listType === 'all' || entry.listType === listType) &&
      (!search ||
        `${entry.firstName} ${entry.lastName}`.toLowerCase().includes(search) ||
        entry.passportNumber.toLowerCase().includes(search)),
  )

  function save(fields: EntryFields, existing?: WatchlistEntry) {
    if (existing) {
      setEntries((current) => current.map((entry) => (entry.id === existing.id ? { ...entry, ...fields } : entry)))
    } else {
      setEntries((current) => [{ ...fields, id: crypto.randomUUID(), status: 'active', listedAt: new Date().toISOString() }, ...current])
      setQuery('')
      setStatus('active')
      setListType('all')
    }
    const displayName = entryName(fields)
      .toLowerCase()
      .replace(/\b\w/g, (letter) => letter.toUpperCase())
    setMessage(
      existing
        ? `Changes saved to ${displayName}’s entry. Upcoming flights are re-screened.`
        : 'Entry added. Upcoming flights are re-screened against it straight away.',
    )
  }

  function clear(entry: WatchlistEntry, reason: string) {
    setEntries((current) =>
      current.map((item) =>
        item.id === entry.id ? { ...item, status: 'cleared', clearReason: reason, clearedAt: new Date().toISOString() } : item,
      ),
    )
    const displayName = entryName(entry)
      .toLowerCase()
      .replace(/\b\w/g, (letter) => letter.toUpperCase())
    setMessage(`${displayName}’s entry cleared. It’s kept on record (see Status: Cleared) and no longer matches.`)
  }

  return { visibleEntries, query, setQuery, status, setStatus, listType, setListType, message, setMessage, save, clear }
}

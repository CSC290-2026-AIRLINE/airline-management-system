import { useState } from 'react'
import { Button } from '@staff-web/components/ui/button'
import { Input } from '@staff-web/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@staff-web/components/ui/native-select'
import { useBiApi } from '../api/bi'
import { useBiLoad } from '../hooks/useBiLoad'

const TYPES: { value: string; label: string }[] = [
  { value: 'a_check', label: 'A-check' },
  { value: 'b_check', label: 'B-check' },
  { value: 'c_check', label: 'C-check' },
  { value: 'd_check', label: 'D-check' },
  { value: 'unscheduled', label: 'Unscheduled' },
]

/**
 * "Mark for maintenance": one small form on the Aircraft use page. It schedules a maintenance period through Feature 9,
 * and `onDone` reloads the page so the new period shows in Days out of service at once.
 */
export function MarkForMaintenance({ aircraft, onDone }: { aircraft: { aircraft_id: string; tail_number: string }[]; onDone: () => void }) {
  const api = useBiApi()
  const access = useBiLoad('maintenance-access', () => api.getMaintenanceAccess())
  const [aircraftId, setAircraftId] = useState(aircraft[0]?.aircraft_id ?? '')
  const [type, setType] = useState(TYPES[2].value)
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  // The maintenance added in this session, listed under the form so the result is visible at once.
  const [added, setAdded] = useState<{ key: string; tail: string; type: string; start: string; end: string }[]>([])
  const [busy, setBusy] = useState(false)

  async function submit() {
    setMessage(null)
    if (!aircraftId || !start || !end) return setMessage('Choose an aircraft and both dates.')
    if (end < start) return setMessage('The end date is before the start date.')
    setBusy(true)
    try {
      await api.markMaintenance(aircraftId, { maintenance_type: type, planned_start_date: start, planned_end_date: end })
      const tail = aircraft.find((a) => a.aircraft_id === aircraftId)?.tail_number ?? aircraftId
      const label = TYPES.find((x) => x.value === type)?.label ?? type
      setAdded((list) => [{ key: `${Date.now()}-${aircraftId}`, tail, type: label, start, end }, ...list])
      setMessage(`Scheduled ${label} for ${tail}, ${start} to ${end}.`)
      onDone()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not schedule the maintenance.')
    } finally {
      setBusy(false)
    }
  }

  // Only admins see the form. The server checks the same rule, so hiding it is a convenience, not the protection.
  if (access.data?.allowed !== true) return null

  return (
    <div className="flex flex-wrap items-center gap-2.5 rounded-xl border bg-card px-4 py-3 text-sm print:hidden">
      <NativeSelect aria-label="Aircraft" value={aircraftId} onChange={(e) => setAircraftId(e.target.value)} className="h-9 w-full sm:w-36">
        {aircraft.map((a) => (
          <NativeSelectOption key={a.aircraft_id} value={a.aircraft_id}>
            {a.tail_number}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <NativeSelect aria-label="Maintenance type" value={type} onChange={(e) => setType(e.target.value)} className="h-9 w-full sm:w-36">
        {TYPES.map((t) => (
          <NativeSelectOption key={t.value} value={t.value}>
            {t.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <Input aria-label="Start date" type="date" value={start} onChange={(e) => setStart(e.target.value)} className="w-full sm:w-40" />
      <Input aria-label="End date" type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="w-full sm:w-40" />
      <Button type="button" onClick={() => void submit()} disabled={busy}>
        {busy ? 'Scheduling…' : 'Mark for maintenance'}
      </Button>
      {message && <span className="text-muted-foreground">{message}</span>}
      {added.length > 0 && (
        <ul className="m-0 basis-full list-disc pl-5 text-primary" aria-label="Maintenance added in this session">
          {added.map((item) => (
            <li key={item.key}>
              <strong>{item.tail}</strong> · {item.type} · {item.start} to {item.end}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

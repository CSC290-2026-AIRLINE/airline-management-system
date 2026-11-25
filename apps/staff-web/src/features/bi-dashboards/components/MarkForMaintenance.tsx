import { useState } from 'react'
import { Button } from '@staff-web/components/ui/button'
import { Card } from '@staff-web/components/ui/card'
import { NativeSelect, NativeSelectOption } from '@staff-web/components/ui/native-select'
import { useBiApi } from '../api/bi'
import { useBiLoad } from '../hooks/useBiLoad'
import { formatDateRange } from '../lib-format'
import { MAINTENANCE_TYPES } from '../lib-maintenance'
import { CARD, CARD_TITLE } from '../lib-styles'
import { DateField, FilterField } from './BiFilters'

/**
 * "Mark for maintenance": one small form on the Aircraft use page. It schedules a maintenance period through Feature 9,
 * and `onDone` reloads the page so the new period shows in Days out of service at once.
 */
export function MarkForMaintenance({ aircraft, onDone }: { aircraft: { aircraft_id: string; tail_number: string }[]; onDone: () => void }) {
  const api = useBiApi()
  const access = useBiLoad('maintenance-access', () => api.getMaintenanceAccess())
  const [aircraftId, setAircraftId] = useState(aircraft[0]?.aircraft_id ?? '')
  const [type, setType] = useState(MAINTENANCE_TYPES[2].value)
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
      const label = MAINTENANCE_TYPES.find((x) => x.value === type)?.label ?? type
      setAdded((list) => [{ key: `${Date.now()}-${aircraftId}`, tail, type: label, start, end }, ...list])
      setMessage(`Scheduled ${label} for ${tail}, ${formatDateRange(start, end)}.`)
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
    <Card className={`${CARD} print:hidden`}>
      <div className="flex flex-col gap-1">
        <h2 className={CARD_TITLE}>Mark for maintenance</h2>
        <p className="text-xs text-muted-foreground">
          Schedules a maintenance period for the aircraft. It shows in Days out of service at once.
        </p>
      </div>
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:gap-3">
        <FilterField label="Aircraft" htmlFor="bi-mx-aircraft">
          <NativeSelect id="bi-mx-aircraft" value={aircraftId} onChange={(e) => setAircraftId(e.target.value)} className="w-full sm:w-36">
            {aircraft.map((a) => (
              <NativeSelectOption key={a.aircraft_id} value={a.aircraft_id}>
                {a.tail_number}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </FilterField>
        <FilterField label="Maintenance type" htmlFor="bi-mx-type">
          <NativeSelect id="bi-mx-type" value={type} onChange={(e) => setType(e.target.value)} className="w-full sm:w-36">
            {MAINTENANCE_TYPES.map((t) => (
              <NativeSelectOption key={t.value} value={t.value}>
                {t.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </FilterField>
        <DateField id="bi-mx-start" label="Start date" value={start} onChange={setStart} placeholder="Choose a date" />
        <DateField id="bi-mx-end" label="End date" value={end} onChange={setEnd} placeholder="Choose a date" />
        <Button type="button" onClick={() => void submit()} disabled={busy}>
          {busy ? 'Scheduling…' : 'Mark for maintenance'}
        </Button>
      </div>
      {message && (
        <p className="text-sm text-muted-foreground" role="status">
          {message}
        </p>
      )}
      {added.length > 0 && (
        <ul className="m-0 list-disc pl-5 text-sm text-primary" aria-label="Maintenance added in this session">
          {added.map((item) => (
            <li key={item.key}>
              <strong>{item.tail}</strong> · {item.type} · {formatDateRange(item.start, item.end)}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

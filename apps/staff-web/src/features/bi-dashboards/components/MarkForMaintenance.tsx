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

export function MarkForMaintenance({ aircraft }: { aircraft: { aircraft_id: string; tail_number: string }[] }) {
  const api = useBiApi()
  const access = useBiLoad('maintenance-access', () => api.getMaintenanceAccess())
  const [aircraftId, setAircraftId] = useState(aircraft[0]?.aircraft_id ?? '')
  const [type, setType] = useState(MAINTENANCE_TYPES[2].value)
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [message, setMessage] = useState<string | null>(null)
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
      setMessage(
        `Requested ${label} for ${tail}, ${formatDateRange(start, end)}. Review it in Operations → Fleet & Aircraft → Maintenance.`,
      )
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not send the maintenance request.')
    } finally {
      setBusy(false)
    }
  }

  // Only admins see the form. The server checks the same rule, so hiding it is a convenience, not the protection.
  if (access.data?.allowed !== true) return null

  return (
    <Card className={`${CARD} print:hidden`}>
      <div className="flex flex-col gap-1">
        <h2 className={CARD_TITLE}>Request maintenance</h2>
        <p className="text-xs text-muted-foreground">Sends a request to Fleet & Aircraft for approval.</p>
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
          {busy ? 'Sending…' : 'Send request'}
        </Button>
      </div>
      {message && (
        <p className="text-sm text-muted-foreground" role="status">
          {message}
        </p>
      )}
    </Card>
  )
}

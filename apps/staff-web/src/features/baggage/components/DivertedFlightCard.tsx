import { useState } from 'react'
import { Button } from '@staff-web/components/ui/button'
import type { DiversionResult } from '../api/found-bags'
import { flightLabel } from '../constants'
import { useDivertedFlights } from '../hooks/useBaggageFlights'
import { errorMessage } from '../hooks/useFoundBags'
import { F10Card, Field, FormError, SelectBox } from './primitives'

function resultText(r: DiversionResult): string {
  const added = r.created.length === 1 ? '1 bag added' : `${r.created.length} bags added`
  return r.skipped > 0 ? `${added} at ${r.divertedTo}. ${r.skipped} already on the list.` : `${added} at ${r.divertedTo}.`
}

/** "Card / Diverted flight": add a held found bag for every tagged bag in the hold of a diverted flight. */
export function DivertedFlightCard({ onRecord }: { onRecord: (flightId: string) => Promise<DiversionResult> }) {
  const diverted = useDivertedFlights()
  const [picked, setPicked] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)

  const flightId = diverted.flights.some((f) => f.id === picked) ? picked : (diverted.flights[0]?.id ?? '')

  async function record() {
    if (!flightId) return
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      setResult(resultText(await onRecord(flightId)))
      // The flight drops off the list once every bag in its hold has been added.
      diverted.reload()
    } catch (e: unknown) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <F10Card aria-labelledby="diverted-flight-title">
      <h2
        id="diverted-flight-title"
        className="m-0 font-sans text-[28px] font-bold tracking-[-1.4px] text-[#14213d] max-md:text-[22px] max-md:tracking-normal"
      >
        Bags from a diverted flight
      </h2>
      {diverted.loading ? (
        <p className="text-sm text-[#677287]">Loading diverted flights…</p>
      ) : diverted.error ? (
        <FormError message={diverted.error} />
      ) : diverted.flights.length === 0 ? (
        <p className="text-sm text-[#677287]">No diverted flight has bags waiting to be added.</p>
      ) : (
        <>
          <div className="flex items-end gap-3 max-md:flex-col max-md:items-stretch">
            <Field label="Diverted flight" htmlFor="dv-flight">
              <SelectBox
                id="dv-flight"
                value={flightId}
                onValueChange={setPicked}
                options={diverted.flights.map((f) => ({ value: f.id, label: flightLabel(f) }))}
              />
            </Field>
            <Button
              type="button"
              disabled={busy || !flightId}
              onClick={() => void record()}
              className="h-auto min-h-[46px] shrink-0 rounded-lg bg-[#14213d] px-5 py-3 text-sm leading-normal font-semibold text-white hover:bg-[#14213d]/90"
            >
              {busy ? 'Adding…' : 'Add bags in its hold'}
            </Button>
          </div>
          <FormError message={error} />
        </>
      )}
      {result && (
        <p role="status" className="rounded-lg bg-success-soft px-3 py-2 text-sm text-success-strong">
          {result}
        </p>
      )}
    </F10Card>
  )
}

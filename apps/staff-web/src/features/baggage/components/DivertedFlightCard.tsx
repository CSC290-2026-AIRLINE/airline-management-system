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
      <h2 id="diverted-flight-title" className="m-0 font-sans text-2xl font-semibold tracking-tight text-foreground max-md:text-xl">
        Bags from a diverted flight
      </h2>
      {diverted.loading ? (
        <p className="text-sm text-muted-foreground">Loading diverted flights…</p>
      ) : diverted.error ? (
        <FormError message={diverted.error} />
      ) : diverted.flights.length === 0 ? (
        <p className="text-sm text-muted-foreground">No diverted flight has bags waiting to be added.</p>
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
            <Button type="button" disabled={busy || !flightId} onClick={() => void record()}>
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

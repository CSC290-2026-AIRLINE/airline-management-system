import { useEffect, useState } from 'react'
import { Label } from '@staff-web/components/ui/label'
import { NativeSelect } from '@staff-web/components/ui/native-select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@staff-web/components/ui/tabs'
import { type StaffApi } from '../api/index.ts'
import type { AirportGateCount } from '../api/types.ts'
import { ErrorBanner } from './ErrorBanner.tsx'
import { messageOf } from './errors.ts'
import { GateBoarding } from './GateBoarding.tsx'
import { ManageGates } from './ManageGates.tsx'
import { INPUT_LABEL, MUTED } from './styles.ts'

export interface GatePageProps {
  api: StaffApi
  /** The tab on screen: the boarding of a gate or the management of the gates of an airport. */
  tab: 'boarding' | 'manage'
  /** The airport of the URL; the first airport with gates when the URL has none. */
  airport?: string
  /** The tab and the airport live in the URL. */
  onSearch: (next: { tab?: 'manage'; airport?: string }) => void
}

/**
 * The gate screen: the boarding of the flights at the gates of an airport, and the management of the gates of
 * every airport. The airport and the tab are in the URL, so a link can open the gates of one airport.
 */
export function GatePage({ api, tab, airport, onSearch }: GatePageProps) {
  const [counts, setCounts] = useState<AirportGateCount[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    api
      .gateCounts()
      .then((list) => {
        if (cancelled) return
        setCounts(list)
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(messageOf(err))
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [api])

  /** The airports again: a gate that was added or turned off changes the counts. */
  const reloadCounts = async () => {
    try {
      setCounts(await api.gateCounts())
    } catch (err) {
      setError(messageOf(err))
    }
  }

  /* The airport of the URL wins; without one the first airport with gates is shown, and an airport without gates
     only when no airport has any. */
  const airportEntry = counts.find((item) => item.airportCode === airport) ?? counts.find((item) => item.gates > 0) ?? counts[0] ?? null
  const noAirport = loading ? 'Loading the airports…' : error ? 'The airports could not be loaded.' : 'No airport to show.'

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="m-0 font-sans text-[36px] font-extrabold leading-[1.1] tracking-tight text-foreground">Gate</h1>
        </div>
        {counts.length > 0 ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor="gate-airport" className={INPUT_LABEL}>
              Airport
            </Label>
            <NativeSelect
              id="gate-airport"
              className="w-[220px]"
              value={airportEntry?.airportCode ?? ''}
              onChange={(event) => onSearch({ airport: event.target.value })}
            >
              {counts.map((item) => (
                <option key={item.airportCode} value={item.airportCode}>
                  {item.airportCode} · {item.city}
                </option>
              ))}
            </NativeSelect>
          </div>
        ) : null}
      </div>

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      <Tabs
        value={tab}
        onValueChange={(value) => onSearch({ tab: value === 'manage' ? 'manage' : undefined, airport: airportEntry?.airportCode })}
        className="gap-6"
      >
        <TabsList className="flex-wrap">
          <TabsTrigger value="boarding">Boarding</TabsTrigger>
          <TabsTrigger value="manage">Manage gates</TabsTrigger>
        </TabsList>

        <TabsContent value="boarding">
          {airportEntry ? (
            /* The airport changes the screen from scratch, so the tab is mounted again for every airport. */
            <GateBoarding key={airportEntry.airportCode} api={api} airportCode={airportEntry.airportCode} />
          ) : (
            <p role="status" className={`m-0 ${MUTED}`}>
              {noAirport}
            </p>
          )}
        </TabsContent>

        <TabsContent value="manage">
          {airportEntry ? (
            <ManageGates key={airportEntry.airportCode} api={api} airport={airportEntry} onChanged={() => void reloadCounts()} />
          ) : (
            <p role="status" className={`m-0 ${MUTED}`}>
              {noAirport}
            </p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { Badge } from '@staff-web/components/ui/badge'
import { Button } from '@staff-web/components/ui/button'
import { Card, CardContent, CardTitle } from '@staff-web/components/ui/card'
import { Separator } from '@staff-web/components/ui/separator'
import { getAircraftType, updateAircraftType } from './api/aircraftType'
import { errorMessage } from './api/http'
import { CABIN_CLASS_NAMES, capacityOf, layoutSummary, rowCount } from './cabin'
import { CapacitySummary } from './components/CapacitySummary'
import { FeatureErrorBoundary } from './components/FeatureErrorBoundary'
import { NewAircraftTypeView } from './components/NewAircraftTypeView'
import { SeatMapPreview } from './components/SeatMapPreview'
import { StaffShell } from './components/StaffShell'
import { BADGE_TONES } from './components/badgeTones'
import { ErrorMessage, LoadingMessage } from './components/StateMessage'
import { formatCurrency, formatNumber } from './format'
import { useApiFetcher, useAuthReady } from './hooks/useApiFetcher'
import type { AircraftType } from './types'

/** One aircraft type: its figures, its cabins and its seat map. The layout is read-only; to change it, clone the type. */
export function AircraftTypeDetailPage({ typeId }: { typeId: string }) {
  const fetcher = useApiFetcher()
  const ready = useAuthReady()
  const navigate = useNavigate()

  const [aircraftType, setAircraftType] = useState<AircraftType | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)

  const [isCloning, setIsCloning] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [isWorking, setIsWorking] = useState(false)

  useEffect(() => {
    if (!ready) {
      return
    }

    let cancelled = false

    async function load() {
      try {
        const result = await getAircraftType(fetcher.current, typeId)
        if (cancelled) {
          return
        }
        setAircraftType(result)
        setState('ready')
      } catch (err) {
        if (cancelled) {
          return
        }
        setLoadError(errorMessage(err, 'Failed to load the aircraft type'))
        setState('error')
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [ready, fetcher, typeId])

  const handleRetire = async () => {
    if (!aircraftType) {
      return
    }

    setActionError(null)
    setIsWorking(true)
    try {
      setAircraftType(await updateAircraftType(fetcher.current, aircraftType.id, { is_active: !aircraftType.is_active }))
    } catch (err) {
      setActionError(errorMessage(err, 'Failed to update the aircraft type'))
    } finally {
      setIsWorking(false)
    }
  }

  const cabins = aircraftType?.layout?.cabins ?? []
  const capacity = capacityOf(cabins)

  const details: [string, string][] = aircraftType
    ? [
        ['Max takeoff weight', `${formatNumber(aircraftType.max_takeoff_weight_kg)} kg`],
        ['Hold weight limit', `${formatNumber(aircraftType.hold_weight_limit_kg)} kg`],
        ['Max range', `${formatNumber(aircraftType.max_range_km)} km`],
        ['Min turnaround', `${aircraftType.min_turnaround_minutes} min`],
        ['Operating cost', `${formatCurrency(aircraftType.operating_cost_per_hour, aircraftType.cost_currency, 0)} / hour`],
      ]
    : []

  if (isCloning && aircraftType) {
    return (
      <FeatureErrorBoundary>
        <StaffShell
          title={`Clone ${aircraftType.code}`}
          description="Give the clone its own code and set its cabins. The figures are copied from the original, and the layout cannot be changed once it is saved."
        >
          <NewAircraftTypeView
            cloneOf={aircraftType}
            onCancel={() => setIsCloning(false)}
            onSaved={(created) => {
              setIsCloning(false)
              void navigate({ to: '/aircraft-types/$typeId', params: { typeId: created.id } })
            }}
          />
        </StaffShell>
      </FeatureErrorBoundary>
    )
  }

  return (
    <FeatureErrorBoundary>
      <StaffShell
        title={aircraftType ? `${aircraftType.code} · ${aircraftType.manufacturer} ${aircraftType.model}` : 'Aircraft type'}
        description="The seat map layout is locked. To change it, clone this type and retire the old one."
      >
        <Button asChild variant="link" className="mb-4 h-auto p-0">
          <Link to="/aircraft-types">← Aircraft Types</Link>
        </Button>

        {state === 'loading' ? (
          <LoadingMessage>Loading the aircraft type...</LoadingMessage>
        ) : state === 'error' || !aircraftType ? (
          <ErrorMessage message={loadError ?? 'The aircraft type could not be loaded.'} />
        ) : (
          <>
            {actionError && <ErrorMessage message={actionError} />}

            <div className="f9-typegrid">
              <div className="f9-stack">
                <Card>
                  <CardContent className="flex flex-col gap-4">
                    <div className="flex items-start justify-between gap-3">
                      <CardTitle>Details</CardTitle>
                      <Badge className={aircraftType.is_active ? BADGE_TONES.green : BADGE_TONES.red}>
                        {aircraftType.is_active ? 'Active' : 'Retired'}
                      </Badge>
                    </div>
                    <dl className="flex flex-col gap-2 text-sm">
                      {details.map(([label, value]) => (
                        <div key={label} className="flex justify-between gap-4">
                          <dt className="text-muted-foreground">{label}</dt>
                          <dd className="font-medium">{value}</dd>
                        </div>
                      ))}
                    </dl>
                    <Separator />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        disabled={isWorking}
                        onClick={() => {
                          setActionError(null)
                          setIsCloning(true)
                        }}
                      >
                        Clone type
                      </Button>
                      <Button type="button" variant="outline" disabled={isWorking} onClick={() => void handleRetire()}>
                        {aircraftType.is_active ? 'Retire type' : 'Reactivate type'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="flex flex-col gap-3">
                    <CardTitle>Cabins</CardTitle>
                    {cabins.map((cabin, index) => (
                      <div
                        key={`${cabin.cabin_class}-${index}`}
                        className="flex items-center justify-between gap-3 rounded-md bg-muted px-3 py-2 text-sm"
                      >
                        <span>
                          <strong>{CABIN_CLASS_NAMES[cabin.cabin_class]}</strong>{' '}
                          <span className="text-muted-foreground">
                            rows {cabin.first_row}-{cabin.last_row}
                          </span>
                        </span>
                        <span className="text-muted-foreground">
                          {rowCount(cabin)} rows · {layoutSummary(cabin.columns, cabin.aisle_after ?? [])}
                        </span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>

              <div className="f9-stack f9-stack--tight">
                <Card>
                  <CardContent className="flex flex-col gap-3">
                    <CapacitySummary
                      total={capacity.total}
                      blocked={capacity.blocked}
                      sellable={capacity.sellable}
                      perCabin={capacity.perCabin}
                    />
                  </CardContent>
                </Card>

                <Card className="py-0">
                  <SeatMapPreview cabins={cabins} readOnly />
                </Card>
              </div>
            </div>
          </>
        )}
      </StaffShell>
    </FeatureErrorBoundary>
  )
}

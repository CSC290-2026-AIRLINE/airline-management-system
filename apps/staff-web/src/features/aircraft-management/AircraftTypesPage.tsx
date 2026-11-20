import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Badge } from '@staff-web/components/ui/badge'
import { Button } from '@staff-web/components/ui/button'
import { Card } from '@staff-web/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@staff-web/components/ui/table'
import { listAircraftTypes } from './api/aircraftType'
import { errorMessage } from './api/http'
import { CABIN_CLASS_NAMES } from './cabin'
import { BADGE_TONES } from './components/badgeTones'
import { FeatureErrorBoundary } from './components/FeatureErrorBoundary'
import { NewAircraftTypeView } from './components/NewAircraftTypeView'
import { StaffShell } from './components/StaffShell'
import { EmptyMessage, ErrorMessage, LoadingMessage } from './components/StateMessage'
import { formatCurrency, formatNumber } from './format'
import { useApiFetcher, useAuthReady } from './hooks/useApiFetcher'
import type { AircraftType } from './types'

export function AircraftTypesPage() {
  const fetcher = useApiFetcher()
  const ready = useAuthReady()
  const navigate = useNavigate()

  const [types, setTypes] = useState<AircraftType[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  const [view, setView] = useState<'list' | 'new'>('list')

  useEffect(() => {
    if (!ready) {
      return
    }

    let cancelled = false

    async function loadTypes() {
      try {
        const result = await listAircraftTypes(fetcher.current)
        if (cancelled) {
          return
        }
        setTypes(result)
        setState('ready')
      } catch (err) {
        if (cancelled) {
          return
        }
        setError(errorMessage(err, 'Failed to load the aircraft types'))
        setState('error')
      }
    }

    void loadTypes()
    return () => {
      cancelled = true
    }
  }, [ready, fetcher, reloadToken])

  const reload = () => setReloadToken((token) => token + 1)
  const openType = (id: string) => void navigate({ to: '/aircraft-types/$typeId', params: { typeId: id } })

  if (view === 'new') {
    return (
      <FeatureErrorBoundary>
        <StaffShell title="New aircraft type" description="Set the cabins and the seat map. The layout cannot be changed once it is saved.">
          <NewAircraftTypeView
            onCancel={() => setView('list')}
            onSaved={() => {
              setView('list')
              reload()
            }}
          />
        </StaffShell>
      </FeatureErrorBoundary>
    )
  }

  return (
    <FeatureErrorBoundary>
      <StaffShell
        title="Aircraft types"
        description="Each type's seat map layout is set once, at creation. To change a layout, clone the type and retire the old one."
      >
        <div className="mb-4 flex justify-end">
          <Button type="button" onClick={() => setView('new')}>
            + New Aircraft Type
          </Button>
        </div>

        <Card className="py-0">
          {state === 'loading' ? (
            <LoadingMessage>Loading aircraft types...</LoadingMessage>
          ) : state === 'error' ? (
            <ErrorMessage
              message={error ?? 'The aircraft types could not be loaded.'}
              onRetry={() => {
                setState('loading')
                reload()
              }}
            />
          ) : types.length === 0 ? (
            <EmptyMessage>No aircraft types yet. Click &quot;+ New Aircraft Type&quot; to add one.</EmptyMessage>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>CODE</TableHead>
                  <TableHead>MANUFACTURER / MODEL</TableHead>
                  <TableHead>HOLD LIMIT</TableHead>
                  <TableHead>MAX TAKEOFF</TableHead>
                  <TableHead>RANGE</TableHead>
                  <TableHead>SEATS</TableHead>
                  <TableHead>TURNAROUND</TableHead>
                  <TableHead>COST / HOUR</TableHead>
                  <TableHead>CABINS</TableHead>
                  <TableHead>STATUS</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {types.map((type) => {
                  const cabins = type.layout?.cabins ?? []
                  const cabinLabel = cabins.length === 1 ? CABIN_CLASS_NAMES[cabins[0].cabin_class] : `${cabins.length} cabins`

                  return (
                    <TableRow
                      key={type.id}
                      className={type.is_active ? 'cursor-pointer' : 'cursor-pointer text-muted-foreground'}
                      onClick={() => openType(type.id)}
                    >
                      <TableCell>
                        <Button
                          type="button"
                          variant="link"
                          className="h-auto p-0 font-semibold"
                          onClick={(event) => {
                            event.stopPropagation()
                            openType(type.id)
                          }}
                        >
                          {type.code}
                        </Button>
                      </TableCell>
                      <TableCell>
                        {type.manufacturer} {type.model}
                      </TableCell>
                      <TableCell>{formatNumber(type.hold_weight_limit_kg)} kg</TableCell>
                      <TableCell>{formatNumber(type.max_takeoff_weight_kg)} kg</TableCell>
                      <TableCell>{formatNumber(type.max_range_km)} km</TableCell>
                      <TableCell>{formatNumber(type.total_seats)}</TableCell>
                      <TableCell>{type.min_turnaround_minutes} min</TableCell>
                      <TableCell>{formatCurrency(type.operating_cost_per_hour, type.cost_currency, 0)}</TableCell>
                      <TableCell>{cabinLabel}</TableCell>
                      <TableCell>
                        <Badge className={type.is_active ? BADGE_TONES.green : BADGE_TONES.red}>
                          {type.is_active ? 'Active' : 'Retired'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </Card>
      </StaffShell>
    </FeatureErrorBoundary>
  )
}

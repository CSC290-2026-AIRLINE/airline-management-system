import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Badge } from '@staff-web/components/ui/badge'
import { Button } from '@staff-web/components/ui/button'
import { Card, CardContent, CardTitle, CardDescription } from '@staff-web/components/ui/card'
import { Input } from '@staff-web/components/ui/input'
import { listAircraft } from './api/aircraft'
import { errorMessage } from './api/http'
import { getFleetReserve, getFleetSettings, getLatestTurnaround, setReserveRatio, updateTurnaroundTask } from './api/readiness'
import { BADGE_TONES } from './components/badgeTones'
import { Field } from './components/Field'
import { FeatureErrorBoundary } from './components/FeatureErrorBoundary'
import { StaffShell } from './components/StaffShell'
import { EmptyMessage, ErrorMessage, LoadingMessage } from './components/StateMessage'
import { formatNumber, formatRatio, formatTime, toDateInputValue } from './format'
import { useApiFetcher, useAuthReady } from './hooks/useApiFetcher'
import {
  TURNAROUND_TASK_STATUSES,
  type Aircraft,
  type FleetReserve,
  type Turnaround,
  type TurnaroundTask,
  type TurnaroundTaskStatus,
} from './types'

interface TurnaroundRow {
  aircraft: Aircraft
  turnaround: Turnaround
}

const TASK_LABELS: Record<string, string> = {
  refuel: 'Refuel',
  cleaning: 'Cleaning',
  catering: 'Catering',
  inspection: 'Inspection',
}

function taskLabel(taskType: string): string {
  return TASK_LABELS[taskType] ?? taskType
}

/** The next status of the cycle the crew uses on the ground. */
function nextStatus(status: TurnaroundTaskStatus): TurnaroundTaskStatus {
  const index = TURNAROUND_TASK_STATUSES.indexOf(status)
  return TURNAROUND_TASK_STATUSES[(index + 1) % TURNAROUND_TASK_STATUSES.length]
}

const PILL_VARIANTS: Record<TurnaroundTaskStatus, 'outline' | 'secondary' | 'default' | 'ghost'> = {
  pending: 'outline',
  in_progress: 'secondary',
  completed: 'default',
  skipped: 'ghost',
}

/** A turnaround is ready when it has tasks and every one is completed or skipped, the same rule the backend uses. */
function allTasksDone(tasks: TurnaroundTask[]): boolean {
  return tasks.length > 0 && tasks.every((task) => task.status === 'completed' || task.status === 'skipped')
}

/** The row with new tasks; is_ready follows the tasks, so the row does not stay stale until the next reload. */
function withTasks(row: TurnaroundRow, tasks: TurnaroundTask[]): TurnaroundRow {
  const isReady = allTasksDone(tasks)
  return {
    ...row,
    turnaround: { ...row.turnaround, tasks, is_ready: isReady, ready_at: isReady ? row.turnaround.ready_at : null },
  }
}

export function ReadinessPage() {
  const fetcher = useApiFetcher()
  const ready = useAuthReady()

  const [selectedDate, setSelectedDate] = useState(() => toDateInputValue(new Date()))
  const [aircraftNeeded, setAircraftNeeded] = useState(1)

  const [reserve, setReserve] = useState<FleetReserve | null>(null)
  const [reserveState, setReserveState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [reserveError, setReserveError] = useState<string | null>(null)
  const [reserveToken, setReserveToken] = useState(0)

  const [ratioInput, setRatioInput] = useState('')
  const [ratioError, setRatioError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const [rows, setRows] = useState<TurnaroundRow[]>([])
  const [turnaroundsState, setTurnaroundsState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [turnaroundsError, setTurnaroundsError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    if (!ready) {
      return
    }

    let cancelled = false

    async function loadReserve() {
      try {
        const data = await getFleetReserve(fetcher.current, selectedDate, aircraftNeeded)
        if (cancelled) {
          return
        }
        setReserve(data)
        setReserveState('ready')
      } catch (err) {
        if (cancelled) {
          return
        }
        setReserve(null)
        setReserveError(errorMessage(err, 'Failed to load the fleet reserve'))
        setReserveState('error')
      }
    }

    void loadReserve()
    return () => {
      cancelled = true
    }
  }, [ready, fetcher, selectedDate, aircraftNeeded, reserveToken])

  useEffect(() => {
    if (!ready) {
      return
    }

    let cancelled = false
    getFleetSettings(fetcher.current)
      .then((settings) => {
        if (!cancelled) {
          setRatioInput(String(settings.reserve_ratio))
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setRatioError(errorMessage(err, 'Failed to load the reserve ratio'))
        }
      })
    return () => {
      cancelled = true
    }
  }, [ready, fetcher])

  useEffect(() => {
    if (!ready) {
      return
    }

    let cancelled = false

    async function loadTurnarounds() {
      try {
        const aircraft = await listAircraft(fetcher.current)
        const inFleet = aircraft.filter(
          (item) => item.entry_into_service_date <= selectedDate && (!item.retired_on || item.retired_on >= selectedDate),
        )

        const turnarounds = await Promise.all(
          inFleet.map(async (item) => ({ aircraft: item, turnaround: await getLatestTurnaround(fetcher.current, item.id) })),
        )

        if (cancelled) {
          return
        }
        setRows(turnarounds.filter((row): row is TurnaroundRow => row.turnaround !== null))
        setTurnaroundsState('ready')
      } catch (err) {
        if (cancelled) {
          return
        }
        setRows([])
        setTurnaroundsError(errorMessage(err, 'Failed to load the turnarounds'))
        setTurnaroundsState('error')
      }
    }

    void loadTurnarounds()
    return () => {
      cancelled = true
    }
  }, [ready, fetcher, selectedDate])

  const handleCycleTaskStatus = async (turnaroundId: string, taskId: string, current: TurnaroundTaskStatus) => {
    setActionError(null)
    setIsSaving(true)
    try {
      const updated = await updateTurnaroundTask(fetcher.current, turnaroundId, taskId, nextStatus(current))
      setRows((currentRows) =>
        currentRows.map((row) =>
          row.turnaround.id === turnaroundId
            ? withTasks(
                row,
                row.turnaround.tasks.map((task) => (task.id === taskId ? updated : task)),
              )
            : row,
        ),
      )
    } catch (err) {
      setActionError(errorMessage(err, 'Failed to update the task'))
    } finally {
      setIsSaving(false)
    }
  }

  const handleSaveRatio = async (event: FormEvent) => {
    event.preventDefault()
    const value = Number(ratioInput)
    if (!Number.isFinite(value) || value < 1 || value > 9.99) {
      setRatioError('The reserve ratio is a number from 1.00 to 9.99.')
      return
    }

    setRatioError(null)
    setIsSaving(true)
    try {
      const saved = await setReserveRatio(fetcher.current, value)
      setRatioInput(String(saved.reserve_ratio))
      setReserveToken((token) => token + 1)
    } catch (err) {
      setRatioError(errorMessage(err, 'Failed to save the reserve ratio'))
    } finally {
      setIsSaving(false)
    }
  }

  const reserveMessage = useMemo(() => {
    if (!reserve) {
      return ''
    }
    return reserve.shortfall > 0
      ? `Short by ${formatNumber(reserve.shortfall)} ready aircraft. Move maintenance to another day or free up reserve.`
      : 'Fleet reserve is satisfied. Enough aircraft are ready.'
  }, [reserve])

  return (
    <FeatureErrorBoundary>
      <StaffShell title="Aircraft readiness" description="Check the fleet reserve for a day and follow each turnaround to ready.">
        {actionError && <ErrorMessage message={actionError} />}

        <div className="f9-readiness">
          <Card>
            <CardContent className="flex flex-col gap-4">
              <CardTitle>Fleet reserve check</CardTitle>
              <CardDescription>Target ready aircraft = aircraft needed that day × reserve ratio, rounded up.</CardDescription>

              <div className="f9-readiness__fields">
                <Field label="Date" htmlFor="readiness-date">
                  <Input id="readiness-date" type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} />
                </Field>
                <Field label="Aircraft needed" htmlFor="readiness-needed">
                  <Input
                    id="readiness-needed"
                    type="number"
                    min={0}
                    step={1}
                    value={aircraftNeeded}
                    onChange={(event) => setAircraftNeeded(Math.max(0, Math.trunc(Number(event.target.value) || 0)))}
                  />
                </Field>
              </div>

              {reserveState === 'loading' ? (
                <LoadingMessage>Loading the fleet reserve...</LoadingMessage>
              ) : reserveState === 'error' ? (
                <ErrorMessage message={reserveError ?? 'Failed to load the fleet reserve'} />
              ) : reserve ? (
                <>
                  <div className="f9-readiness__metrics">
                    <div className="f9-readiness__tile">
                      <div className="f9-metric__label">RESERVE RATIO</div>
                      <div className="f9-metric__value">{formatRatio(reserve.reserve_ratio)}</div>
                    </div>
                    <div className="f9-readiness__tile">
                      <div className="f9-metric__label">TARGET READY</div>
                      <div className="f9-metric__value">{formatNumber(reserve.target)}</div>
                    </div>
                    <div className="f9-readiness__tile">
                      <div className="f9-metric__label">READY NOW</div>
                      <div className="f9-metric__value">{formatNumber(reserve.ready)}</div>
                    </div>
                    <div className={reserve.shortfall > 0 ? 'f9-readiness__tile f9-readiness__tile--short' : 'f9-readiness__tile'}>
                      <div className="f9-metric__label">SHORTFALL</div>
                      <div className="f9-metric__value">{formatNumber(reserve.shortfall)}</div>
                    </div>
                  </div>

                  <div className="f9-readiness__bar" aria-hidden="true">
                    <div
                      className={reserve.shortfall > 0 ? 'f9-readiness__fill f9-readiness__fill--short' : 'f9-readiness__fill'}
                      style={{ width: `${reserve.target > 0 ? Math.min(100, (reserve.ready / reserve.target) * 100) : 100}%` }}
                    />
                  </div>

                  <p className="f9-note" style={{ marginTop: 14 }}>
                    {reserveMessage}
                  </p>
                </>
              ) : null}

              <p className="f9-note f9-note--small" style={{ marginTop: 14 }}>
                Ready = in the fleet, in service all day, operating that weekday, not in maintenance.
              </p>

              <form className="flex items-end gap-3" onSubmit={(event) => void handleSaveRatio(event)}>
                <Field label="Reserve ratio (1.00 to 9.99)" htmlFor="reserve-ratio">
                  <Input
                    id="reserve-ratio"
                    type="number"
                    min={1}
                    max={9.99}
                    step="0.01"
                    value={ratioInput}
                    onChange={(event) => setRatioInput(event.target.value)}
                  />
                </Field>
                <Button type="submit" variant="outline" disabled={isSaving}>
                  Save ratio
                </Button>
              </form>
              {ratioError && <ErrorMessage message={ratioError} />}
            </CardContent>
          </Card>

          <div>
            <div className="f9-sectionhead">
              <div>
                <h2 className="f9-readiness__title">Turnarounds</h2>
                <p className="f9-readiness__lead">
                  Click a task to cycle pending, in progress, completed, skipped. Ready when every task is completed or skipped.
                </p>
              </div>
            </div>

            {turnaroundsState === 'loading' ? (
              <LoadingMessage>Loading turnarounds...</LoadingMessage>
            ) : turnaroundsState === 'error' ? (
              <ErrorMessage message={turnaroundsError ?? 'Failed to load the turnarounds'} />
            ) : rows.length === 0 ? (
              <EmptyMessage>No turnaround has been recorded for the aircraft in the fleet on this date.</EmptyMessage>
            ) : (
              <div className="f9-stack">
                {rows.map((row) => (
                  <Card key={row.turnaround.id}>
                    <CardContent className="flex flex-col gap-3">
                      <div className="f9-turnaround__head">
                        <div>
                          <span className="f9-turnaround__tail">{row.aircraft.tail_number}</span>{' '}
                          <span className="f9-turnaround__meta">
                            landed {row.turnaround.airport_code} · {formatTime(row.turnaround.arrived_at)}
                          </span>
                        </div>
                        <Badge className={row.turnaround.is_ready ? BADGE_TONES.green : BADGE_TONES.amber}>
                          {row.turnaround.is_ready ? 'Ready' : 'Not ready'}
                        </Badge>
                      </div>

                      <div className="f9-turnaround__tasks">
                        {row.turnaround.tasks.map((task) => (
                          <Button
                            key={task.id}
                            type="button"
                            size="sm"
                            variant={PILL_VARIANTS[task.status]}
                            disabled={isSaving}
                            onClick={() => void handleCycleTaskStatus(row.turnaround.id, task.id, task.status)}
                          >
                            {taskLabel(task.task_type)} · {task.status.replace('_', ' ')}
                          </Button>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </StaffShell>
    </FeatureErrorBoundary>
  )
}

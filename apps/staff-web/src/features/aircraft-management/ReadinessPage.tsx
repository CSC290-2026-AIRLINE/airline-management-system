import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { listAircraft } from './api/aircraft'
import { errorMessage } from './api/http'
import { getFleetReserve, getLatestTurnaround, startTurnaround, updateTurnaroundTask } from './api/readiness'
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

const PILL_VARIANTS: Record<TurnaroundTaskStatus, string> = {
  pending: 'f9-pillbtn--pending',
  in_progress: 'f9-pillbtn--progress',
  completed: 'f9-pillbtn--completed',
  skipped: 'f9-pillbtn--skipped',
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

  const [rows, setRows] = useState<TurnaroundRow[]>([])
  const [fleet, setFleet] = useState<Aircraft[]>([])
  const [turnaroundsState, setTurnaroundsState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [turnaroundsError, setTurnaroundsError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  const [actionError, setActionError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const [isStartOpen, setIsStartOpen] = useState(false)
  const [startAircraftId, setStartAircraftId] = useState('')
  const [startFlightId, setStartFlightId] = useState('')
  const [startAirport, setStartAirport] = useState('')
  const [startArrivedAt, setStartArrivedAt] = useState('')

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
  }, [ready, fetcher, selectedDate, aircraftNeeded])

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
        setFleet(aircraft)
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
  }, [ready, fetcher, selectedDate, reloadToken])

  const openStart = () => {
    setActionError(null)
    setStartAircraftId(rows[0]?.aircraft.id ?? fleet[0]?.id ?? '')
    setStartFlightId('')
    setStartAirport('')
    setStartArrivedAt('')
    setIsStartOpen(true)
  }

  const handleStart = async (event: FormEvent) => {
    event.preventDefault()
    if (!startAircraftId) {
      setActionError('Choose the aircraft the flight landed with')
      return
    }
    if (!startFlightId.trim()) {
      setActionError('The flight id is required')
      return
    }
    if (!/^[A-Za-z]{3}$/.test(startAirport.trim())) {
      setActionError('The airport code is a three letter IATA code, for example BKK')
      return
    }
    if (!startArrivedAt) {
      setActionError('The landing time is required')
      return
    }

    setActionError(null)
    setIsSaving(true)
    try {
      await startTurnaround(fetcher.current, startAircraftId, {
        flight_id: startFlightId.trim(),
        airport_code: startAirport.trim().toUpperCase(),
        arrived_at: new Date(startArrivedAt).toISOString(),
      })
      setIsStartOpen(false)
      setReloadToken((token) => token + 1)
    } catch (err) {
      setActionError(errorMessage(err, 'Failed to start the turnaround'))
    } finally {
      setIsSaving(false)
    }
  }

  const handleCycleTaskStatus = async (turnaroundId: string, taskId: string, current: TurnaroundTaskStatus) => {
    const target = nextStatus(current)

    setActionError(null)
    setIsSaving(true)
    try {
      const updated = await updateTurnaroundTask(fetcher.current, turnaroundId, taskId, target)
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
      <StaffShell activeTab="readiness">
        {actionError && <ErrorMessage message={actionError} />}

        <div className="f9-readiness">
          <div className="f9-card f9-readiness__card">
            <h2 className="f9-readiness__title">Fleet reserve check</h2>
            <p className="f9-readiness__lead">Target ready aircraft = aircraft needed that day × reserve ratio, rounded up.</p>

            <div className="f9-readiness__fields">
              <label className="f9-field">
                <span className="f9-field__label">Date</span>
                <input type="date" className="f9-input" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} />
              </label>
              <label className="f9-field">
                <span className="f9-field__label">Aircraft needed</span>
                <input
                  type="number"
                  min={0}
                  className="f9-input"
                  value={aircraftNeeded}
                  onChange={(event) => setAircraftNeeded(Math.max(0, Number(event.target.value) || 0))}
                />
              </label>
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

                <p className="f9-note" style={{ marginTop: 18 }}>
                  {reserveMessage}
                </p>
              </>
            ) : null}

            <p className="f9-note f9-note--small" style={{ marginTop: 14 }}>
              Ready = in the fleet, in service all day, operating that weekday, not in maintenance.
            </p>
          </div>

          <div>
            <div className="f9-sectionhead">
              <div>
                <h2 className="f9-readiness__title">Turnarounds</h2>
                <p className="f9-readiness__lead">
                  Started by the simulation clock when a flight lands. Click a task to cycle pending, in progress, completed, skipped. Ready
                  when every task is completed or skipped.
                </p>
              </div>
              <button type="button" className="f9-btn f9-btn--outline" onClick={openStart}>
                + Start by hand
              </button>
            </div>

            {turnaroundsState === 'loading' ? (
              <LoadingMessage>Loading turnarounds...</LoadingMessage>
            ) : turnaroundsState === 'error' ? (
              <ErrorMessage message={turnaroundsError ?? 'Failed to load the turnarounds'} />
            ) : rows.length === 0 ? (
              <EmptyMessage>No turnaround has been recorded for this date.</EmptyMessage>
            ) : (
              <div className="f9-stack">
                {rows.map((row) => {
                  const isAllReady = row.turnaround.is_ready

                  return (
                    <div className="f9-turnaround" key={row.turnaround.id}>
                      <div className="f9-turnaround__head">
                        <div>
                          <span className="f9-turnaround__tail">{row.aircraft.tail_number}</span>{' '}
                          <span className="f9-turnaround__meta">
                            landed {row.turnaround.airport_code} · {formatTime(row.turnaround.arrived_at)}
                          </span>
                        </div>
                        <span className={isAllReady ? 'f9-badge f9-badge--green' : 'f9-badge f9-badge--amber'}>
                          {isAllReady ? 'Ready' : 'Not ready'}
                        </span>
                      </div>

                      <div className="f9-turnaround__tasks">
                        {row.turnaround.tasks.map((task) => (
                          <button
                            key={task.id}
                            type="button"
                            className={`f9-pillbtn ${PILL_VARIANTS[task.status]}`}
                            disabled={isSaving}
                            onClick={() => void handleCycleTaskStatus(row.turnaround.id, task.id, task.status)}
                          >
                            {taskLabel(task.task_type)} · {task.status.replace('_', ' ')}
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {isStartOpen && (
          <div className="f9-modal" role="dialog" aria-modal="true" aria-label="Start a turnaround">
            <div className="f9-modal__card">
              <h3 className="f9-modal__title">Start a turnaround by hand</h3>
              <form onSubmit={(event) => void handleStart(event)}>
                <div className="f9-modal__field">
                  <label className="f9-field" htmlFor="start-aircraft">
                    <span className="f9-field__label">Aircraft</span>
                    <select
                      id="start-aircraft"
                      className="f9-select"
                      value={startAircraftId}
                      onChange={(event) => setStartAircraftId(event.target.value)}
                      required
                    >
                      <option value="" disabled>
                        Select an aircraft
                      </option>
                      {fleet.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.tail_number} · {item.base_airport_code}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="f9-modal__field">
                  <label className="f9-field" htmlFor="start-flight">
                    <span className="f9-field__label">Flight id</span>
                    <input
                      id="start-flight"
                      type="text"
                      className="f9-input"
                      placeholder="The id of the flight that landed"
                      value={startFlightId}
                      onChange={(event) => setStartFlightId(event.target.value)}
                      required
                    />
                  </label>
                </div>

                <div className="f9-modal__row">
                  <label className="f9-field" htmlFor="start-airport">
                    <span className="f9-field__label">Airport code</span>
                    <input
                      id="start-airport"
                      type="text"
                      className="f9-input"
                      maxLength={3}
                      placeholder="BKK"
                      value={startAirport}
                      onChange={(event) => setStartAirport(event.target.value)}
                      required
                    />
                  </label>
                  <label className="f9-field" htmlFor="start-arrived">
                    <span className="f9-field__label">Landed at</span>
                    <input
                      id="start-arrived"
                      type="datetime-local"
                      className="f9-input"
                      value={startArrivedAt}
                      onChange={(event) => setStartArrivedAt(event.target.value)}
                      required
                    />
                  </label>
                </div>

                <p className="f9-modal__hint">
                  The flight id has to be a flight that exists; the turnaround opens with the standard task set.
                </p>

                <div className="f9-modal__actions">
                  <button type="button" className="f9-btn f9-btn--outline" onClick={() => setIsStartOpen(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="f9-btn" disabled={isSaving}>
                    {isSaving ? 'Starting...' : 'Start turnaround'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </StaffShell>
    </FeatureErrorBoundary>
  )
}

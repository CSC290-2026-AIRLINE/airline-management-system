import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  createAircraft,
  createAircraftStatus,
  createMaintenance,
  getOperatingDays,
  listAircraft,
  listMaintenance,
  listStatusHistory,
  removeStatusPeriod,
  setOperatingDays,
  updateAircraft,
  updateMaintenance,
} from './api/aircraft'
import { listAircraftTypes } from './api/aircraftType'
import { errorMessage } from './api/http'
import { Button } from '@staff-web/components/ui/button'
import { Card, CardContent } from '@staff-web/components/ui/card'
import { Input } from '@staff-web/components/ui/input'
import { NativeSelect } from '@staff-web/components/ui/native-select'
import { Separator } from '@staff-web/components/ui/separator'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@staff-web/components/ui/table'
import { Field } from './components/Field'
import { FormDialog } from './components/FormDialog'
import { FeatureErrorBoundary } from './components/FeatureErrorBoundary'
import { StaffShell } from './components/StaffShell'
import { StatusBadge } from './components/StatusBadge'
import { EmptyMessage, ErrorMessage, LoadingMessage } from './components/StateMessage'
import { addDays, formatDate, toDateInputValue } from './format'
import { useApiFetcher, useAuthReady } from './hooks/useApiFetcher'
import {
  AIRCRAFT_STATUSES,
  MAINTENANCE_TYPES,
  MANUAL_AIRCRAFT_STATUSES,
  WEEKDAYS,
  type Aircraft,
  type AircraftStatus,
  type AircraftType,
  type MaintenanceWindow,
  type ManualAircraftStatus,
  type StatusPeriod,
} from './types'

const MAINTENANCE_TYPE_LABELS: Record<string, string> = {
  a_check: 'A check',
  b_check: 'B check',
  c_check: 'C check',
  d_check: 'D check',
  unscheduled: 'Unscheduled repair',
}

const STATUS_FILTER_LABELS: Record<AircraftStatus, string> = {
  in_service: 'In service',
  in_maintenance: 'In maintenance',
  grounded: 'Grounded',
}

const MANUAL_STATUS_LABELS: Record<ManualAircraftStatus, string> = {
  in_service: 'In service',
  grounded: 'Grounded',
}

interface AircraftDetail {
  statusHistory: StatusPeriod[]
  maintenance: MaintenanceWindow[]
  operatingDays: number[]
}

/** The list endpoint returns the type reference; a freshly created aircraft only carries its id. */
function typeOf(item: Aircraft, types: AircraftType[]): string {
  if (item.aircraft_type) {
    return item.aircraft_type.model
  }
  return types.find((type) => type.id === item.aircraft_type_id)?.model ?? item.aircraft_type_id
}

export function AircraftManagementPage() {
  const fetcher = useApiFetcher()
  const ready = useAuthReady()

  const [aircraft, setAircraft] = useState<Aircraft[]>([])
  const [aircraftTypes, setAircraftTypes] = useState<AircraftType[]>([])
  const [fleetState, setFleetState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [fleetError, setFleetError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<AircraftDetail | null>(null)
  const [detailState, setDetailState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [detailError, setDetailError] = useState<string | null>(null)
  const [detailToken, setDetailToken] = useState(0)

  const [actionError, setActionError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [baseFilter, setBaseFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [cancelPeriodId, setCancelPeriodId] = useState<string | null>(null)

  // A maintenance window being rescheduled or completed, and the window whose cancel is waiting for a confirm.
  const [windowAction, setWindowAction] = useState<{ kind: 'reschedule' | 'complete'; window: MaintenanceWindow } | null>(null)
  const [windowStart, setWindowStart] = useState('')
  const [windowEnd, setWindowEnd] = useState('')
  const [cancelWindowId, setCancelWindowId] = useState<string | null>(null)
  // Set when the last operating day was switched off: no weekday means the aircraft flies every day, and the screen says so.
  const [everyDayNotice, setEveryDayNotice] = useState(false)

  const [isRegisterOpen, setIsRegisterOpen] = useState(false)
  const [newTailNumber, setNewTailNumber] = useState('')
  const [newTypeId, setNewTypeId] = useState('')
  const [newBase, setNewBase] = useState('')
  const [newEntryDate, setNewEntryDate] = useState(() => toDateInputValue(new Date()))

  const [isStatusOpen, setIsStatusOpen] = useState(false)
  const [statusValue, setStatusValue] = useState<ManualAircraftStatus>('in_service')
  const [statusReason, setStatusReason] = useState('')
  const [statusStart, setStatusStart] = useState(() => toDateInputValue(new Date()))
  const [statusEnd, setStatusEnd] = useState('')

  const [isMaintenanceOpen, setIsMaintenanceOpen] = useState(false)
  const [maintenanceType, setMaintenanceType] = useState<string>('a_check')
  const [maintenanceStart, setMaintenanceStart] = useState(() => toDateInputValue(new Date()))
  const [maintenanceEnd, setMaintenanceEnd] = useState(() => toDateInputValue(addDays(new Date(), 7)))

  // An error from a dialog is shown inside it; one from the page itself is shown above the fleet.
  const isModalOpen = isRegisterOpen || isStatusOpen || isMaintenanceOpen || windowAction !== null

  const reloadFleet = () => setReloadToken((token) => token + 1)
  const retryFleet = () => {
    setFleetState('loading')
    setFleetError(null)
    reloadFleet()
  }
  const reloadDetail = () => {
    setDetailState('loading')
    setDetailError(null)
    setDetailToken((token) => token + 1)
  }
  const selectAircraft = (id: string) => {
    setEveryDayNotice(false)
    setDetailState('loading')
    setDetailError(null)
    setSelectedId(id)
  }

  useEffect(() => {
    if (!ready) {
      return
    }

    let cancelled = false

    async function loadFleet() {
      try {
        const [fleet, types] = await Promise.all([listAircraft(fetcher.current), listAircraftTypes(fetcher.current)])
        if (cancelled) {
          return
        }
        setAircraft(fleet)
        setAircraftTypes(types)
        setSelectedId((current) => current ?? fleet[0]?.id ?? null)
        setFleetState('ready')
      } catch (err) {
        if (cancelled) {
          return
        }
        setFleetError(errorMessage(err, 'Failed to load the fleet'))
        setFleetState('error')
      }
    }

    void loadFleet()
    return () => {
      cancelled = true
    }
  }, [ready, fetcher, reloadToken])

  useEffect(() => {
    if (!ready) {
      return
    }

    if (!selectedId) {
      return
    }

    const aircraftId = selectedId
    let cancelled = false

    async function loadDetail() {
      try {
        const [statusHistory, maintenance, operatingDays] = await Promise.all([
          listStatusHistory(fetcher.current, aircraftId),
          listMaintenance(fetcher.current, aircraftId),
          getOperatingDays(fetcher.current, aircraftId),
        ])
        if (cancelled) {
          return
        }
        setDetail({ statusHistory, maintenance, operatingDays: operatingDays.days })
        setDetailState('ready')
      } catch (err) {
        if (cancelled) {
          return
        }
        setDetail(null)
        setDetailError(errorMessage(err, 'Failed to load the aircraft details'))
        setDetailState('error')
      }
    }

    void loadDetail()
    return () => {
      cancelled = true
    }
  }, [ready, fetcher, selectedId, detailToken])

  const selectedAircraft = useMemo(() => aircraft.find((item) => item.id === selectedId) ?? null, [aircraft, selectedId])

  const visibleAircraft = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase()
    return aircraft.filter(
      (item) =>
        (!typeFilter || item.aircraft_type_id === typeFilter) &&
        (!baseFilter || item.base_airport_code === baseFilter) &&
        (!statusFilter || item.current_status === statusFilter) &&
        (!needle ||
          item.tail_number.toLowerCase().includes(needle) ||
          typeOf(item, aircraftTypes).toLowerCase().includes(needle) ||
          item.base_airport_code.toLowerCase().includes(needle)),
    )
  }, [aircraft, aircraftTypes, searchTerm, typeFilter, baseFilter, statusFilter])

  // A retired type cannot take new aircraft, so it is not offered in the register dialog.
  const activeTypes = useMemo(() => aircraftTypes.filter((type) => type.is_active), [aircraftTypes])

  const baseOptions = useMemo(() => Array.from(new Set(aircraft.map((item) => item.base_airport_code))).sort(), [aircraft])

  const openRegister = () => {
    setActionError(null)
    setNewTailNumber('')
    setNewTypeId(activeTypes[0]?.id ?? '')
    setNewBase('')
    setNewEntryDate(toDateInputValue(new Date()))
    setIsRegisterOpen(true)
  }

  const handleRegister = async (event: FormEvent) => {
    event.preventDefault()
    if (!newTailNumber.trim() || !newTypeId || !newBase.trim()) {
      setActionError('Aircraft number, aircraft type and base airport are required')
      return
    }

    setActionError(null)
    setIsSubmitting(true)
    try {
      const created = await createAircraft(fetcher.current, {
        tail_number: newTailNumber.trim().toUpperCase(),
        aircraft_type_id: newTypeId,
        base_airport_code: newBase.trim().toUpperCase(),
        entry_into_service_date: newEntryDate,
      })
      setIsRegisterOpen(false)
      setSelectedId(created.id)
      reloadFleet()
    } catch (err) {
      setActionError(errorMessage(err, 'Failed to register the aircraft'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const openStatus = () => {
    if (!selectedAircraft) {
      return
    }
    setActionError(null)
    setStatusValue(selectedAircraft.current_status === 'grounded' ? 'grounded' : 'in_service')
    setStatusReason('')
    setStatusStart('')
    setStatusEnd('')
    setIsStatusOpen(true)
  }

  const handleSaveStatus = async (event: FormEvent) => {
    event.preventDefault()
    if (!selectedAircraft) {
      return
    }
    if (statusEnd && statusEnd < statusStart) {
      setActionError('The end date cannot be before the start date')
      return
    }

    setActionError(null)
    setIsSubmitting(true)
    try {
      await createAircraftStatus(fetcher.current, selectedAircraft.id, {
        status: statusValue,
        reason: statusReason.trim() || undefined,
        start_date: statusStart,
        end_date: statusEnd || null,
      })
      setIsStatusOpen(false)
      reloadFleet()
      reloadDetail()
    } catch (err) {
      setActionError(errorMessage(err, 'Failed to save the status'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleScheduleMaintenance = async (event: FormEvent) => {
    event.preventDefault()
    if (!selectedAircraft) {
      return
    }
    if (maintenanceEnd < maintenanceStart) {
      setActionError('The planned end date cannot be before the planned start date')
      return
    }

    setActionError(null)
    setIsSubmitting(true)
    try {
      await createMaintenance(fetcher.current, selectedAircraft.id, {
        maintenance_type: maintenanceType,
        planned_start_date: maintenanceStart,
        planned_end_date: maintenanceEnd,
      })
      setIsMaintenanceOpen(false)
      reloadFleet()
      reloadDetail()
    } catch (err) {
      setActionError(errorMessage(err, 'Failed to schedule the maintenance'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const openWindowAction = (kind: 'reschedule' | 'complete', window: MaintenanceWindow) => {
    setActionError(null)
    setWindowStart(window.planned_start_date)
    setWindowEnd(window.planned_end_date)
    setWindowAction({ kind, window })
  }

  const handleSaveWindow = async (event: FormEvent) => {
    event.preventDefault()
    if (!selectedAircraft || !windowAction) {
      return
    }

    setActionError(null)
    setIsSubmitting(true)
    try {
      await updateMaintenance(
        fetcher.current,
        selectedAircraft.id,
        windowAction.window.id,
        windowAction.kind === 'complete'
          ? { status: 'completed', actual_end_date: windowEnd }
          : { planned_start_date: windowStart, planned_end_date: windowEnd },
      )
      setWindowAction(null)
      reloadFleet()
      reloadDetail()
    } catch (err) {
      setActionError(errorMessage(err, 'Failed to update the maintenance window'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCancelWindow = async (windowId: string) => {
    if (!selectedAircraft) {
      return
    }

    setActionError(null)
    setIsSubmitting(true)
    try {
      await updateMaintenance(fetcher.current, selectedAircraft.id, windowId, { status: 'cancelled' })
      setCancelWindowId(null)
      reloadFleet()
      reloadDetail()
    } catch (err) {
      setCancelWindowId(null)
      setActionError(errorMessage(err, 'Failed to cancel the maintenance window'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCancelPeriod = async (periodId: string) => {
    if (!selectedAircraft) {
      return
    }

    setActionError(null)
    setIsSubmitting(true)
    try {
      await removeStatusPeriod(fetcher.current, selectedAircraft.id, periodId)
      setCancelPeriodId(null)
      reloadFleet()
      reloadDetail()
    } catch (err) {
      setCancelPeriodId(null)
      setActionError(errorMessage(err, 'Failed to cancel the status record'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleToggleRetired = async () => {
    if (!selectedAircraft) {
      return
    }

    setActionError(null)
    setIsSubmitting(true)
    try {
      await updateAircraft(fetcher.current, selectedAircraft.id, {
        retired_on: selectedAircraft.retired_on ? null : toDateInputValue(new Date()),
      })
      reloadFleet()
      reloadDetail()
    } catch (err) {
      setActionError(errorMessage(err, 'Failed to update the aircraft'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleToggleOperatingDay = async (day: number) => {
    if (!selectedAircraft || !detail) {
      return
    }

    const activeDays = detail.operatingDays.length > 0 ? detail.operatingDays : [1, 2, 3, 4, 5, 6, 7]
    const nextDays = activeDays.includes(day) ? activeDays.filter((value) => value !== day) : [...activeDays, day]
    setActionError(null)
    setIsSubmitting(true)
    try {
      const saved = await setOperatingDays(
        fetcher.current,
        selectedAircraft.id,
        nextDays.sort((a, b) => a - b),
      )
      setDetail((current) => (current ? { ...current, operatingDays: saved.days } : current))
      setEveryDayNotice(saved.days.length === 0)
    } catch (err) {
      setActionError(errorMessage(err, 'Failed to save the operating days'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const activeOperatingDays = detail && detail.operatingDays.length > 0 ? detail.operatingDays : [1, 2, 3, 4, 5, 6, 7]

  const closeDialog = (close: () => void) => () => {
    close()
    setActionError(null)
  }

  return (
    <FeatureErrorBoundary>
      <StaffShell title="Fleet & Aircraft" description="Register aircraft, set their status and operating days, and schedule maintenance.">
        {actionError && !isModalOpen && <ErrorMessage message={actionError} />}

        <div className="f9-fleet">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <Input
                type="search"
                placeholder="Search aircraft number, type or base"
                aria-label="Search the fleet"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
              <Button type="button" disabled={fleetState !== 'ready'} onClick={openRegister}>
                + Register Aircraft
              </Button>
            </div>

            <div className="flex flex-wrap gap-2">
              <NativeSelect aria-label="Filter by type" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
                <option value="">All types</option>
                {aircraftTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.code}
                  </option>
                ))}
              </NativeSelect>
              <NativeSelect aria-label="Filter by base" value={baseFilter} onChange={(event) => setBaseFilter(event.target.value)}>
                <option value="">All bases</option>
                {baseOptions.map((base) => (
                  <option key={base} value={base}>
                    {base}
                  </option>
                ))}
              </NativeSelect>
              <NativeSelect aria-label="Filter by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="">All statuses</option>
                {AIRCRAFT_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {STATUS_FILTER_LABELS[status]}
                  </option>
                ))}
              </NativeSelect>
            </div>

            <Card className="py-0">
              {fleetState === 'loading' ? (
                <LoadingMessage>Loading fleet data...</LoadingMessage>
              ) : fleetState === 'error' ? (
                <ErrorMessage message={fleetError ?? 'Failed to load the fleet'} onRetry={retryFleet} />
              ) : visibleAircraft.length === 0 ? (
                <EmptyMessage>
                  {aircraft.length === 0
                    ? 'No aircraft found. Click "+ Register Aircraft" to add one.'
                    : 'No aircraft match the search and the filters.'}
                </EmptyMessage>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>AIRCRAFT NO.</TableHead>
                      <TableHead>TYPE</TableHead>
                      <TableHead>BASE</TableHead>
                      <TableHead>RETIRED ON</TableHead>
                      <TableHead>STATUS</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleAircraft.map((item) => (
                      <TableRow
                        key={item.id}
                        className="cursor-pointer"
                        data-state={selectedId === item.id ? 'selected' : undefined}
                        onClick={() => selectAircraft(item.id)}
                      >
                        <TableCell>
                          <Button
                            type="button"
                            variant="link"
                            className="h-auto p-0 font-semibold text-[var(--f9-ink)] no-underline hover:underline"
                            onClick={(event) => {
                              event.stopPropagation()
                              selectAircraft(item.id)
                            }}
                          >
                            {item.tail_number}
                          </Button>
                        </TableCell>
                        <TableCell>{typeOf(item, aircraftTypes)}</TableCell>
                        <TableCell>{item.base_airport_code}</TableCell>
                        <TableCell>{formatDate(item.retired_on)}</TableCell>
                        <TableCell>
                          <StatusBadge status={item.current_status} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Card>
          </div>

          <Card aria-label="Aircraft details">
            <CardContent className="flex flex-col gap-4">
              {!selectedAircraft ? (
                <EmptyMessage>Select an aircraft to view its details</EmptyMessage>
              ) : detailState === 'loading' ? (
                <LoadingMessage>Loading aircraft details...</LoadingMessage>
              ) : detailState === 'error' ? (
                <ErrorMessage message={detailError ?? 'Failed to load the aircraft details'} onRetry={reloadDetail} />
              ) : (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="font-sans text-xl font-semibold text-[var(--f9-ink)]">{selectedAircraft.tail_number}</h2>
                      <p className="text-sm text-muted-foreground">
                        {typeOf(selectedAircraft, aircraftTypes)} · base {selectedAircraft.base_airport_code}
                      </p>
                    </div>
                    <Button type="button" variant="outline" onClick={openStatus}>
                      Set Status
                    </Button>
                  </div>

                  <div>
                    <StatusBadge status={selectedAircraft.current_status} />
                  </div>

                  <dl className="flex flex-col gap-2 text-sm">
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">Retired on</dt>
                      <dd>{formatDate(selectedAircraft.retired_on)}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">Entry into service</dt>
                      <dd>{formatDate(selectedAircraft.entry_into_service_date)}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">Base airport</dt>
                      <dd>{selectedAircraft.base_airport_code}</dd>
                    </div>
                  </dl>

                  <div>
                    <Button type="button" variant="outline" disabled={isSubmitting} onClick={() => void handleToggleRetired()}>
                      {selectedAircraft.retired_on ? 'Reinstate aircraft' : 'Retire aircraft'}
                    </Button>
                  </div>

                  <Separator />

                  <section className="flex flex-col gap-2">
                    <h3 className="text-xs font-semibold tracking-wide text-muted-foreground">OPERATING DAYS</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {WEEKDAYS.map((day, index) => {
                        const dayNumber = index + 1
                        const isActive = activeOperatingDays.includes(dayNumber)
                        return (
                          <Button
                            key={day}
                            type="button"
                            size="sm"
                            variant={isActive ? 'default' : 'outline'}
                            aria-pressed={isActive}
                            disabled={isSubmitting}
                            onClick={() => void handleToggleOperatingDay(dayNumber)}
                          >
                            {day}
                          </Button>
                        )
                      })}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {everyDayNotice
                        ? 'No weekday is selected, so the aircraft flies every day.'
                        : activeOperatingDays.length === 7
                          ? 'Flies every day.'
                          : `Flies ${activeOperatingDays.length} days a week.`}
                    </p>
                  </section>

                  <Separator />

                  <section className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground">MAINTENANCE</h3>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setActionError(null)
                          setMaintenanceType('a_check')
                          setMaintenanceStart(toDateInputValue(new Date()))
                          setMaintenanceEnd(toDateInputValue(addDays(new Date(), 7)))
                          setIsMaintenanceOpen(true)
                        }}
                      >
                        + Schedule
                      </Button>
                    </div>
                    {detail && detail.maintenance.length > 0 ? (
                      <ul className="flex flex-col gap-3 text-sm">
                        {detail.maintenance.map((window) => (
                          <li key={window.id} className="flex flex-col gap-1">
                            <strong>
                              {MAINTENANCE_TYPE_LABELS[window.maintenance_type] ?? window.maintenance_type} ·{' '}
                              {window.status.replace('_', ' ')}
                            </strong>
                            <span className="text-muted-foreground">
                              {formatDate(window.planned_start_date)} to {formatDate(window.planned_end_date)}
                              {window.actual_end_date ? ` · finished ${formatDate(window.actual_end_date)}` : ''}
                            </span>
                            {(window.status === 'planned' || window.status === 'in_progress') && (
                              <span className="flex flex-wrap gap-1">
                                <Button type="button" variant="link" size="xs" onClick={() => openWindowAction('reschedule', window)}>
                                  Reschedule
                                </Button>
                                <Button type="button" variant="link" size="xs" onClick={() => openWindowAction('complete', window)}>
                                  Complete
                                </Button>
                                {cancelWindowId === window.id ? (
                                  <>
                                    <Button
                                      type="button"
                                      variant="destructive"
                                      size="xs"
                                      disabled={isSubmitting}
                                      onClick={() => void handleCancelWindow(window.id)}
                                    >
                                      Yes, cancel
                                    </Button>
                                    <Button type="button" variant="ghost" size="xs" onClick={() => setCancelWindowId(null)}>
                                      Keep
                                    </Button>
                                  </>
                                ) : (
                                  <Button
                                    type="button"
                                    variant="link"
                                    size="xs"
                                    className="text-destructive"
                                    onClick={() => setCancelWindowId(window.id)}
                                  >
                                    Cancel window
                                  </Button>
                                )}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground">No maintenance windows planned.</p>
                    )}
                  </section>

                  <Separator />

                  <section className="flex flex-col gap-2">
                    <h3 className="text-xs font-semibold tracking-wide text-muted-foreground">STATUS HISTORY</h3>
                    {detail && detail.statusHistory.length > 0 ? (
                      <ul className="flex flex-col gap-3 text-sm">
                        {detail.statusHistory.map((period) => (
                          <li key={period.id} className="flex flex-col gap-1">
                            <strong>{period.status.replace('_', ' ')}</strong>
                            <span className="text-muted-foreground">
                              {formatDate(period.start_date)}
                              {period.end_date ? ` to ${formatDate(period.end_date)}` : ' onwards'}
                            </span>
                            {period.reason && <span className="text-muted-foreground">{period.reason}</span>}
                            {period.origin !== 'maintenance' && (
                              <span className="flex flex-wrap gap-1">
                                {cancelPeriodId === period.id ? (
                                  <>
                                    <Button
                                      type="button"
                                      variant="destructive"
                                      size="xs"
                                      disabled={isSubmitting}
                                      onClick={() => void handleCancelPeriod(period.id)}
                                    >
                                      Yes, cancel
                                    </Button>
                                    <Button type="button" variant="ghost" size="xs" onClick={() => setCancelPeriodId(null)}>
                                      Keep
                                    </Button>
                                  </>
                                ) : (
                                  <Button
                                    type="button"
                                    variant="link"
                                    size="xs"
                                    className="text-destructive"
                                    onClick={() => setCancelPeriodId(period.id)}
                                  >
                                    Cancel record
                                  </Button>
                                )}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground">No status periods recorded.</p>
                    )}
                  </section>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {isRegisterOpen && (
          <FormDialog
            title="Register Aircraft"
            error={actionError}
            isSubmitting={isSubmitting}
            submitLabel="Register"
            submittingLabel="Registering..."
            onClose={closeDialog(() => setIsRegisterOpen(false))}
            onSubmit={(event) => void handleRegister(event)}
          >
            <Field label="Aircraft number (registration)" htmlFor="register-tail">
              <Input
                id="register-tail"
                placeholder="HS-ABF"
                value={newTailNumber}
                onChange={(event) => setNewTailNumber(event.target.value)}
                required
              />
            </Field>
            <div className="flex gap-3">
              <Field label="Aircraft type" htmlFor="register-type">
                <NativeSelect
                  id="register-type"
                  className="w-full"
                  value={newTypeId}
                  onChange={(event) => setNewTypeId(event.target.value)}
                  required
                >
                  <option value="" disabled>
                    Select a type
                  </option>
                  {activeTypes.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.code} · {type.model}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Base airport" htmlFor="register-base">
                <Input
                  id="register-base"
                  placeholder="BKK"
                  maxLength={3}
                  value={newBase}
                  onChange={(event) => setNewBase(event.target.value)}
                  required
                />
              </Field>
            </div>
            <Field label="Entry into service" htmlFor="register-entry">
              <Input
                id="register-entry"
                type="date"
                value={newEntryDate}
                onChange={(event) => setNewEntryDate(event.target.value)}
                required
              />
            </Field>
          </FormDialog>
        )}

        {isStatusOpen && selectedAircraft && (
          <FormDialog
            title={`Set Status · ${selectedAircraft.tail_number}`}
            error={actionError}
            isSubmitting={isSubmitting}
            submitLabel="Save"
            submittingLabel="Saving..."
            onClose={closeDialog(() => setIsStatusOpen(false))}
            onSubmit={(event) => void handleSaveStatus(event)}
          >
            <Field label="Status" htmlFor="status-value">
              <NativeSelect
                id="status-value"
                className="w-full"
                value={statusValue}
                onChange={(event) => setStatusValue(event.target.value as ManualAircraftStatus)}
              >
                {MANUAL_AIRCRAFT_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {MANUAL_STATUS_LABELS[status]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Reason" htmlFor="status-reason">
              <Input
                id="status-reason"
                placeholder="Scheduled inspection"
                value={statusReason}
                onChange={(event) => setStatusReason(event.target.value)}
              />
            </Field>
            <div className="flex gap-3">
              <Field label="Start date" htmlFor="status-start">
                <Input
                  id="status-start"
                  type="date"
                  value={statusStart}
                  onChange={(event) => setStatusStart(event.target.value)}
                  required
                />
              </Field>
              <Field label="End date (optional)" htmlFor="status-end">
                <Input id="status-end" type="date" value={statusEnd} onChange={(event) => setStatusEnd(event.target.value)} />
              </Field>
            </div>
          </FormDialog>
        )}

        {isMaintenanceOpen && selectedAircraft && (
          <FormDialog
            title={`Schedule Maintenance · ${selectedAircraft.tail_number}`}
            error={actionError}
            isSubmitting={isSubmitting}
            submitLabel="Schedule"
            submittingLabel="Scheduling..."
            onClose={closeDialog(() => setIsMaintenanceOpen(false))}
            onSubmit={(event) => void handleScheduleMaintenance(event)}
          >
            <Field label="Check type" htmlFor="maintenance-type">
              <NativeSelect
                id="maintenance-type"
                className="w-full"
                value={maintenanceType}
                onChange={(event) => setMaintenanceType(event.target.value)}
              >
                {MAINTENANCE_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {MAINTENANCE_TYPE_LABELS[type]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <div className="flex gap-3">
              <Field label="Planned start" htmlFor="maintenance-start">
                <Input
                  id="maintenance-start"
                  type="date"
                  value={maintenanceStart}
                  onChange={(event) => setMaintenanceStart(event.target.value)}
                  required
                />
              </Field>
              <Field label="Planned end (available again)" htmlFor="maintenance-end">
                <Input
                  id="maintenance-end"
                  type="date"
                  value={maintenanceEnd}
                  onChange={(event) => setMaintenanceEnd(event.target.value)}
                  required
                />
              </Field>
            </div>
            <p className="text-sm text-muted-foreground">Saving also sets the aircraft to In maintenance for these dates.</p>
          </FormDialog>
        )}

        {windowAction && selectedAircraft && (
          <FormDialog
            title={`${windowAction.kind === 'complete' ? 'Complete Maintenance' : 'Reschedule Maintenance'} · ${selectedAircraft.tail_number}`}
            error={actionError}
            isSubmitting={isSubmitting}
            submitLabel={windowAction.kind === 'complete' ? 'Complete' : 'Reschedule'}
            submittingLabel="Saving..."
            onClose={closeDialog(() => setWindowAction(null))}
            onSubmit={(event) => void handleSaveWindow(event)}
          >
            {windowAction.kind === 'reschedule' ? (
              <div className="flex gap-3">
                <Field label="Planned start" htmlFor="window-start">
                  <Input
                    id="window-start"
                    type="date"
                    value={windowStart}
                    onChange={(event) => setWindowStart(event.target.value)}
                    required
                  />
                </Field>
                <Field label="Planned end (available again)" htmlFor="window-end">
                  <Input id="window-end" type="date" value={windowEnd} onChange={(event) => setWindowEnd(event.target.value)} required />
                </Field>
              </div>
            ) : (
              <Field label="Actual end (available again)" htmlFor="window-actual-end">
                <Input
                  id="window-actual-end"
                  type="date"
                  value={windowEnd}
                  onChange={(event) => setWindowEnd(event.target.value)}
                  required
                />
              </Field>
            )}
            <p className="text-sm text-muted-foreground">
              {windowAction.kind === 'complete'
                ? 'Saving shortens or extends the In maintenance dates of the aircraft to this date.'
                : 'Saving also moves the In maintenance dates of the aircraft.'}
            </p>
          </FormDialog>
        )}
      </StaffShell>
    </FeatureErrorBoundary>
  )
}

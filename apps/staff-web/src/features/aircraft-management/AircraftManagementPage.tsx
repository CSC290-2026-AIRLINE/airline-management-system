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
} from './api/aircraft'
import { listAircraftTypes } from './api/aircraftType'
import { errorMessage } from './api/http'
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
  const isModalOpen = isRegisterOpen || isStatusOpen || isMaintenanceOpen

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
        (!statusFilter || item.current_status.status === statusFilter) &&
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
      setActionError('Tail number, aircraft type and base airport are required')
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
    setStatusValue(selectedAircraft.current_status.status === 'grounded' ? 'grounded' : 'in_service')
    setStatusReason(selectedAircraft.current_status.reason ?? '')
    setStatusStart(selectedAircraft.current_status.start_date ?? toDateInputValue(new Date()))
    setStatusEnd(selectedAircraft.current_status.end_date ?? '')
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
    if (nextDays.length === 0) {
      setActionError('An aircraft has to keep at least one operating day')
      return
    }

    setActionError(null)
    setIsSubmitting(true)
    try {
      const saved = await setOperatingDays(
        fetcher.current,
        selectedAircraft.id,
        nextDays.sort((a, b) => a - b),
      )
      setDetail((current) => (current ? { ...current, operatingDays: saved.days } : current))
    } catch (err) {
      setActionError(errorMessage(err, 'Failed to save the operating days'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const activeOperatingDays = detail && detail.operatingDays.length > 0 ? detail.operatingDays : [1, 2, 3, 4, 5, 6, 7]

  return (
    <FeatureErrorBoundary>
      <StaffShell activeTab="fleet">
        {actionError && !isModalOpen && <ErrorMessage message={actionError} />}

        <div className="f9-fleet">
          <div>
            <div className="f9-toolbar">
              <input
                type="text"
                className="f9-search"
                placeholder="Search tail number, type or base"
                aria-label="Search the fleet"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
              <button type="button" className="f9-btn" disabled={fleetState !== 'ready'} onClick={openRegister}>
                + Register Aircraft
              </button>
            </div>

            <div className="f9-filters">
              <select
                className="f9-select"
                aria-label="Filter by type"
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value)}
              >
                <option value="">All types</option>
                {aircraftTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.code}
                  </option>
                ))}
              </select>
              <select
                className="f9-select"
                aria-label="Filter by base"
                value={baseFilter}
                onChange={(event) => setBaseFilter(event.target.value)}
              >
                <option value="">All bases</option>
                {baseOptions.map((base) => (
                  <option key={base} value={base}>
                    {base}
                  </option>
                ))}
              </select>
              <select
                className="f9-select"
                aria-label="Filter by status"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option value="">All statuses</option>
                {AIRCRAFT_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {STATUS_FILTER_LABELS[status]}
                  </option>
                ))}
              </select>
            </div>

            <div className="f9-card f9-fleet__table">
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
                <table className="f9-table">
                  <thead>
                    <tr>
                      <th>TAIL #</th>
                      <th>TYPE</th>
                      <th>BASE</th>
                      <th>RETIRED ON</th>
                      <th>STATUS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleAircraft.map((item) => (
                      <tr
                        key={item.id}
                        className={selectedId === item.id ? 'f9-table__row--selected' : undefined}
                        onClick={() => selectAircraft(item.id)}
                      >
                        <td>
                          <button type="button" className="f9-table__pick" onClick={() => selectAircraft(item.id)}>
                            {item.tail_number}
                          </button>
                        </td>
                        <td>{typeOf(item, aircraftTypes)}</td>
                        <td>{item.base_airport_code}</td>
                        <td>{formatDate(item.retired_on)}</td>
                        <td>
                          <StatusBadge status={item.current_status.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <aside className="f9-card f9-detail">
            {!selectedAircraft ? (
              <EmptyMessage>Select an aircraft to view its details</EmptyMessage>
            ) : detailState === 'loading' ? (
              <LoadingMessage>Loading aircraft details...</LoadingMessage>
            ) : detailState === 'error' ? (
              <ErrorMessage message={detailError ?? 'Failed to load the aircraft details'} onRetry={reloadDetail} />
            ) : (
              <>
                <div className="f9-detail__head">
                  <div>
                    <h2 className="f9-detail__tail">{selectedAircraft.tail_number}</h2>
                    <p className="f9-detail__sub">
                      {typeOf(selectedAircraft, aircraftTypes)} · base {selectedAircraft.base_airport_code}
                    </p>
                  </div>
                  <button type="button" className="f9-btn f9-btn--outline" onClick={openStatus}>
                    Set Status
                  </button>
                </div>

                <div className="f9-detail__badge">
                  <StatusBadge status={selectedAircraft.current_status.status} />
                </div>

                <div className="f9-detail__row">
                  <span>Retired on</span>
                  <span>{formatDate(selectedAircraft.retired_on)}</span>
                </div>

                <div className="f9-detail__actions">
                  <button
                    type="button"
                    className="f9-btn f9-btn--outline"
                    disabled={isSubmitting}
                    onClick={() => void handleToggleRetired()}
                  >
                    {selectedAircraft.retired_on ? 'Reinstate aircraft' : 'Retire aircraft'}
                  </button>
                </div>

                <div className="f9-detail__row">
                  <span>Entry into service</span>
                  <span>{formatDate(selectedAircraft.entry_into_service_date)}</span>
                </div>
                <div className="f9-detail__row">
                  <span>Base airport</span>
                  <span>{selectedAircraft.base_airport_code}</span>
                </div>

                <section className="f9-detail__section">
                  <h3 className="f9-label">OPERATING DAYS</h3>
                  <div className="f9-chips">
                    {WEEKDAYS.map((day, index) => {
                      const dayNumber = index + 1
                      const isActive = activeOperatingDays.includes(dayNumber)
                      return (
                        <button
                          key={day}
                          type="button"
                          className={isActive ? 'f9-chip f9-chip--on' : 'f9-chip'}
                          aria-pressed={isActive}
                          disabled={isSubmitting}
                          onClick={() => void handleToggleOperatingDay(dayNumber)}
                        >
                          {day}
                        </button>
                      )
                    })}
                  </div>
                  <p className="f9-detail__hint">
                    {activeOperatingDays.length === 7 ? 'Flies every day.' : `Flies ${activeOperatingDays.length} days a week.`}
                  </p>
                </section>

                <section className="f9-detail__section">
                  <div className="f9-detail__sectionhead">
                    <h3 className="f9-label">MAINTENANCE</h3>
                    <button
                      type="button"
                      className="f9-btn f9-btn--outline f9-btn--sm"
                      onClick={() => {
                        setActionError(null)
                        setMaintenanceType('a_check')
                        setMaintenanceStart(toDateInputValue(new Date()))
                        setMaintenanceEnd(toDateInputValue(addDays(new Date(), 7)))
                        setIsMaintenanceOpen(true)
                      }}
                    >
                      + Schedule
                    </button>
                  </div>
                  {detail && detail.maintenance.length > 0 ? (
                    <ul className="f9-detail__list">
                      {detail.maintenance.map((window) => (
                        <li key={window.id}>
                          <strong>
                            {MAINTENANCE_TYPE_LABELS[window.maintenance_type] ?? window.maintenance_type} · {window.status}
                          </strong>
                          <span>
                            {formatDate(window.planned_start_date)} to {formatDate(window.planned_end_date)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="f9-detail__hint">No maintenance windows planned.</p>
                  )}
                </section>

                <section className="f9-detail__section">
                  <h3 className="f9-label">STATUS HISTORY</h3>
                  {detail && detail.statusHistory.length > 0 ? (
                    <ul className="f9-detail__list">
                      {detail.statusHistory.map((period) => (
                        <li key={period.id}>
                          <strong>{period.status}</strong>
                          <span>
                            {formatDate(period.start_date)}
                            {period.end_date ? ` to ${formatDate(period.end_date)}` : ' onwards'}
                            {period.origin !== 'maintenance' &&
                              (cancelPeriodId === period.id ? (
                                <>
                                  <button
                                    type="button"
                                    className="f9-detail__cancel"
                                    disabled={isSubmitting}
                                    onClick={() => void handleCancelPeriod(period.id)}
                                  >
                                    Yes, cancel
                                  </button>
                                  <button type="button" className="f9-detail__keep" onClick={() => setCancelPeriodId(null)}>
                                    Keep
                                  </button>
                                </>
                              ) : (
                                <button type="button" className="f9-detail__cancel" onClick={() => setCancelPeriodId(period.id)}>
                                  Cancel record
                                </button>
                              ))}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="f9-detail__hint">No status periods recorded.</p>
                  )}
                </section>
              </>
            )}
          </aside>
        </div>

        {isRegisterOpen && (
          <div className="f9-modal" role="dialog" aria-modal="true" aria-label="Register Aircraft">
            <div className="f9-modal__card">
              <h3 className="f9-modal__title">Register Aircraft</h3>
              {actionError && <ErrorMessage message={actionError} />}
              <form onSubmit={(event) => void handleRegister(event)}>
                <div className="f9-modal__field">
                  <label className="f9-field" htmlFor="register-tail">
                    <span className="f9-field__label">Tail number (the registration)</span>
                    <input
                      id="register-tail"
                      type="text"
                      className="f9-input"
                      placeholder="HS-ABF"
                      value={newTailNumber}
                      onChange={(event) => setNewTailNumber(event.target.value)}
                      required
                    />
                  </label>
                </div>

                <div className="f9-modal__row">
                  <label className="f9-field" htmlFor="register-type">
                    <span className="f9-field__label">Aircraft type</span>
                    <select
                      id="register-type"
                      className="f9-select"
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
                    </select>
                  </label>
                  <label className="f9-field" htmlFor="register-base">
                    <span className="f9-field__label">Base airport</span>
                    <input
                      id="register-base"
                      type="text"
                      className="f9-input"
                      placeholder="BKK"
                      maxLength={3}
                      value={newBase}
                      onChange={(event) => setNewBase(event.target.value)}
                      required
                    />
                  </label>
                </div>

                <div className="f9-modal__field">
                  <label className="f9-field" htmlFor="register-entry">
                    <span className="f9-field__label">Entry into service</span>
                    <input
                      id="register-entry"
                      type="date"
                      className="f9-input"
                      value={newEntryDate}
                      onChange={(event) => setNewEntryDate(event.target.value)}
                      required
                    />
                  </label>
                </div>

                <div className="f9-modal__actions">
                  <button
                    type="button"
                    className="f9-btn f9-btn--outline"
                    onClick={() => {
                      setIsRegisterOpen(false)
                      setActionError(null)
                    }}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="f9-btn" disabled={isSubmitting}>
                    {isSubmitting ? 'Registering...' : 'Register'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {isStatusOpen && selectedAircraft && (
          <div className="f9-modal" role="dialog" aria-modal="true" aria-label="Set Status">
            <div className="f9-modal__card">
              <h3 className="f9-modal__title">Set Status · {selectedAircraft.tail_number}</h3>
              {actionError && <ErrorMessage message={actionError} />}
              <form onSubmit={(event) => void handleSaveStatus(event)}>
                <div className="f9-modal__field">
                  <label className="f9-field" htmlFor="status-value">
                    <span className="f9-field__label">Status</span>
                    <select
                      id="status-value"
                      className="f9-select"
                      value={statusValue}
                      onChange={(event) => setStatusValue(event.target.value as ManualAircraftStatus)}
                    >
                      {MANUAL_AIRCRAFT_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {MANUAL_STATUS_LABELS[status]}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="f9-modal__field">
                  <label className="f9-field" htmlFor="status-reason">
                    <span className="f9-field__label">Reason</span>
                    <input
                      id="status-reason"
                      type="text"
                      className="f9-input"
                      placeholder="Scheduled inspection"
                      value={statusReason}
                      onChange={(event) => setStatusReason(event.target.value)}
                    />
                  </label>
                </div>

                <div className="f9-modal__row">
                  <label className="f9-field" htmlFor="status-start">
                    <span className="f9-field__label">Start date</span>
                    <input
                      id="status-start"
                      type="date"
                      className="f9-input"
                      value={statusStart}
                      onChange={(event) => setStatusStart(event.target.value)}
                      required
                    />
                  </label>
                  <label className="f9-field" htmlFor="status-end">
                    <span className="f9-field__label">End date (optional)</span>
                    <input
                      id="status-end"
                      type="date"
                      className="f9-input"
                      value={statusEnd}
                      onChange={(event) => setStatusEnd(event.target.value)}
                    />
                  </label>
                </div>

                <div className="f9-modal__actions">
                  <button
                    type="button"
                    className="f9-btn f9-btn--outline"
                    onClick={() => {
                      setIsStatusOpen(false)
                      setActionError(null)
                    }}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="f9-btn" disabled={isSubmitting}>
                    {isSubmitting ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {isMaintenanceOpen && selectedAircraft && (
          <div className="f9-modal" role="dialog" aria-modal="true" aria-label="Schedule Maintenance">
            <div className="f9-modal__card">
              <h3 className="f9-modal__title">Schedule Maintenance · {selectedAircraft.tail_number}</h3>
              {actionError && <ErrorMessage message={actionError} />}
              <form onSubmit={(event) => void handleScheduleMaintenance(event)}>
                <div className="f9-modal__field">
                  <label className="f9-field" htmlFor="maintenance-type">
                    <span className="f9-field__label">Check type</span>
                    <select
                      id="maintenance-type"
                      className="f9-select"
                      value={maintenanceType}
                      onChange={(event) => setMaintenanceType(event.target.value)}
                    >
                      {MAINTENANCE_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {MAINTENANCE_TYPE_LABELS[type]}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="f9-modal__row">
                  <label className="f9-field" htmlFor="maintenance-start">
                    <span className="f9-field__label">Planned start</span>
                    <input
                      id="maintenance-start"
                      type="date"
                      className="f9-input"
                      value={maintenanceStart}
                      onChange={(event) => setMaintenanceStart(event.target.value)}
                      required
                    />
                  </label>
                  <label className="f9-field" htmlFor="maintenance-end">
                    <span className="f9-field__label">Planned end (available again)</span>
                    <input
                      id="maintenance-end"
                      type="date"
                      className="f9-input"
                      value={maintenanceEnd}
                      onChange={(event) => setMaintenanceEnd(event.target.value)}
                      required
                    />
                  </label>
                </div>

                <p className="f9-modal__hint">Saving also sets the aircraft to In maintenance for these dates.</p>

                <div className="f9-modal__actions">
                  <button
                    type="button"
                    className="f9-btn f9-btn--outline"
                    onClick={() => {
                      setIsMaintenanceOpen(false)
                      setActionError(null)
                    }}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="f9-btn" disabled={isSubmitting}>
                    {isSubmitting ? 'Scheduling...' : 'Schedule'}
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

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { cloneAircraftType, listAircraftTypes, updateAircraftType } from './api/aircraftType'
import { errorMessage } from './api/http'
import { CABIN_CLASS_LABELS } from './cabin'
import { AircraftTypeDetailModal } from './components/AircraftTypeDetailModal'
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

  const [types, setTypes] = useState<AircraftType[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  const [view, setView] = useState<'list' | 'new'>('list')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isCloneOpen, setIsCloneOpen] = useState(false)
  const [cloneCode, setCloneCode] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)
  const [isWorking, setIsWorking] = useState(false)

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

  const selectedType = useMemo(() => types.find((type) => type.id === selectedId) ?? null, [types, selectedId])

  const reload = () => setReloadToken((token) => token + 1)

  const openClone = () => {
    if (!selectedType) {
      return
    }
    setActionError(null)
    setCloneCode(`${selectedType.code}-COPY`)
    setIsCloneOpen(true)
  }

  const handleClone = async (event: FormEvent) => {
    event.preventDefault()
    if (!selectedType) {
      return
    }
    if (!cloneCode.trim()) {
      setActionError('The clone needs its own code')
      return
    }

    setActionError(null)
    setIsWorking(true)
    try {
      await cloneAircraftType(fetcher.current, selectedType.id, cloneCode.trim().toUpperCase())
      setIsCloneOpen(false)
      setSelectedId(null)
      reload()
    } catch (err) {
      setActionError(errorMessage(err, 'Failed to clone the aircraft type'))
    } finally {
      setIsWorking(false)
    }
  }

  const handleRetire = async () => {
    if (!selectedType) {
      return
    }

    setActionError(null)
    setIsWorking(true)
    try {
      await updateAircraftType(fetcher.current, selectedType.id, { is_active: !selectedType.is_active })
      reload()
    } catch (err) {
      setActionError(errorMessage(err, 'Failed to update the aircraft type'))
    } finally {
      setIsWorking(false)
    }
  }

  if (view === 'new') {
    return (
      <FeatureErrorBoundary>
        <StaffShell activeTab="types">
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
      <StaffShell activeTab="types">
        {actionError && <ErrorMessage message={actionError} />}

        <div className="f9-sectionhead" style={{ marginTop: 20 }}>
          <div>
            <h2 className="f9-heading">Aircraft types</h2>
            <p className="f9-lead">
              Each type's seat map layout is set once, at creation. To change a layout, clone the type and retire the old one.
            </p>
          </div>
          <button type="button" className="f9-btn" onClick={() => setView('new')}>
            + New Aircraft Type
          </button>
        </div>

        <div className="f9-card f9-types">
          {state === 'loading' ? (
            <LoadingMessage>Loading aircraft types...</LoadingMessage>
          ) : state === 'error' ? (
            <EmptyMessage>{error ?? 'The aircraft types could not be loaded.'}</EmptyMessage>
          ) : types.length === 0 ? (
            <EmptyMessage>No aircraft types yet. Click &quot;+ New Aircraft Type&quot; to add one.</EmptyMessage>
          ) : (
            <table className="f9-table f9-table--types">
              <thead>
                <tr>
                  <th>CODE</th>
                  <th>MANUFACTURER / MODEL</th>
                  <th>HOLD LIMIT</th>
                  <th>SEATS</th>
                  <th>TURNAROUND</th>
                  <th>COST / HOUR</th>
                  <th>CABINS</th>
                </tr>
              </thead>
              <tbody>
                {types.map((type) => {
                  const cabins = type.layout?.cabins ?? []
                  const cabinLabel = cabins.length === 1 ? CABIN_CLASS_LABELS[cabins[0].cabin_class] : `${cabins.length} cabins`

                  return (
                    <tr key={type.id} onClick={() => setSelectedId(type.id)}>
                      <td>
                        <button type="button" className="f9-table__pick" onClick={() => setSelectedId(type.id)}>
                          {type.code}
                        </button>
                      </td>
                      <td>
                        {type.manufacturer} {type.model}
                      </td>
                      <td>{formatNumber(type.hold_weight_limit_kg)} kg</td>
                      <td>{formatNumber(type.total_seats)}</td>
                      <td>{type.min_turnaround_minutes} min</td>
                      <td>{formatCurrency(type.operating_cost_per_hour, type.cost_currency, 0)}</td>
                      <td>
                        <span className="f9-types__cabins">{cabinLabel}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {selectedType && (
          <AircraftTypeDetailModal
            aircraftType={selectedType}
            isWorking={isWorking}
            onClose={() => setSelectedId(null)}
            onClone={openClone}
            onRetire={() => void handleRetire()}
          />
        )}

        {isCloneOpen && selectedType && (
          <div className="f9-modal" role="dialog" aria-modal="true" aria-label="Clone aircraft type">
            <div className="f9-modal__card">
              <h3 className="f9-modal__title">Clone {selectedType.code}</h3>
              <form onSubmit={(event) => void handleClone(event)}>
                <div className="f9-modal__field">
                  <label className="f9-field" htmlFor="clone-code">
                    <span className="f9-field__label">Code of the clone</span>
                    <input
                      id="clone-code"
                      type="text"
                      className="f9-input"
                      value={cloneCode}
                      onChange={(event) => setCloneCode(event.target.value)}
                      required
                    />
                  </label>
                </div>
                <p className="f9-modal__hint">The clone starts with the layout of {selectedType.code}.</p>
                <div className="f9-modal__actions">
                  <button type="button" className="f9-btn f9-btn--outline" onClick={() => setIsCloneOpen(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="f9-btn" disabled={isWorking}>
                    {isWorking ? 'Cloning...' : 'Clone'}
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

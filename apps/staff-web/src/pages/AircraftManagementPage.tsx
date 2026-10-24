import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { aircraftService } from '../services/aircraftService';
import type { Aircraft, AircraftStatus } from '../types/aircraft';

export type { Aircraft };

export function AircraftManagementPage() {
  const [aircrafts, setAircrafts] = useState<Aircraft[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [availableAircraftTypes, setAvailableAircraftTypes] = useState<
    { code: string; capacity: number }[]
  >([
    { code: 'A320', capacity: 180 },
    { code: 'A321', capacity: 220 },
    { code: 'B738', capacity: 189 },
  ]);

  const [selectedAircraft, setSelectedAircraft] = useState<Aircraft | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');

  const [isSetStatusOpen, setIsSetStatusOpen] = useState<boolean>(false);
  const [modalStatus, setModalStatus] = useState<AircraftStatus>('In service');
  const [modalReason, setModalReason] = useState<string>('');
  const [modalStartDate, setModalStartDate] = useState<string>('2026-10-10');
  const [modalEndDate, setModalEndDate] = useState<string>('2026-10-14');

  const [isScheduleOpen, setIsScheduleOpen] = useState<boolean>(false);
  const [scheduleCheckType, setScheduleCheckType] = useState<string>('A check');
  const [scheduleStart, setScheduleStart] = useState<string>('2026-10-10');
  const [scheduleEnd, setScheduleEnd] = useState<string>('2026-10-14');

  const [isRegisterOpen, setIsRegisterOpen] = useState<boolean>(false);
  const [newTailNumber, setNewTailNumber] = useState<string>('');
  const [newModel, setNewModel] = useState<string>('A320');
  const [newBase, setNewBase] = useState<string>('BKK');
  const [newCapacity, setNewCapacity] = useState<number>(180);
  const [newEntryDate, setNewEntryDate] = useState<string>('2026-10-22');

  const [operatingDays, setOperatingDays] = useState<Record<string, string[]>>({});

  const daysOfWeek = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const [reloadTrigger, setReloadTrigger] = useState(0);

  useEffect(() => {
    let isMounted = true;

    async function fetchData() {
      try {
        const [loadedAircrafts, types] = await Promise.all([
          aircraftService.getAll(),
          aircraftService.getAircraftTypes(),
        ]);

        if (!isMounted) return;

        setAircrafts(loadedAircrafts);
        if (loadedAircrafts.length > 0) {
          setSelectedAircraft(loadedAircrafts[0]);
        }

        if (types.length > 0) {
          setAvailableAircraftTypes(types);
          setNewModel(types[0].code);
          setNewCapacity(types[0].capacity);
        }
      } catch (err: unknown) {
        if (!isMounted) return;
        const msg = err instanceof Error ? err.message : 'Failed to load aircraft fleet';
        console.error(msg);
        setFetchError(msg);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void fetchData();

    return () => {
      isMounted = false;
    };
  }, [reloadTrigger]);

  const handleRetry = () => {
    setIsLoading(true);
    setFetchError(null);
    setReloadTrigger((prev) => prev + 1);
  };

  const handleSelectAircraft = async (aircraft: Aircraft) => {
    setSelectedAircraft(aircraft);
    if (!operatingDays[aircraft.id]) {
      try {
        const days = await aircraftService.getOperatingDays(aircraft.id);
        setOperatingDays((prev) => ({
          ...prev,
          [aircraft.id]: days,
        }));
      } catch (err) {
        console.warn('Could not load operating days:', err);
      }
    }
  };

  const handleToggleDay = async (day: string) => {
    if (!selectedAircraft) return;
    const currentDays = operatingDays[selectedAircraft.id] || daysOfWeek;
    const updatedDays = currentDays.includes(day)
      ? currentDays.filter((d) => d !== day)
      : [...currentDays, day];

    setOperatingDays((prev) => ({
      ...prev,
      [selectedAircraft.id]: updatedDays,
    }));

    try {
      await aircraftService.setOperatingDays(selectedAircraft.id, updatedDays);
    } catch (err) {
      console.error('Failed to update operating days on server:', err);
    }
  };

  const handleToggleRetire = async () => {
    if (!selectedAircraft) return;
    const todayStr = new Date().toISOString().split('T')[0];
    const newRetiredOn = selectedAircraft.retiredOn ? null : todayStr;

    try {
      const updated = await aircraftService.update(selectedAircraft.id, {
        retired_on: newRetiredOn,
      });
      setSelectedAircraft(updated);
      setAircrafts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    } catch (err) {
      console.error('Failed to update retired status on server:', err);
      const updated: Aircraft = { ...selectedAircraft, retiredOn: newRetiredOn };
      setSelectedAircraft(updated);
      setAircrafts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    }
  };

  const handleOpenSetStatus = () => {
    if (!selectedAircraft) return;
    setModalStatus(selectedAircraft.status);
    setModalReason(selectedAircraft.statusReason || '');
    setModalStartDate(selectedAircraft.statusStartDate || '2026-10-10');
    setModalEndDate(selectedAircraft.statusEndDate || '2026-10-14');
    setIsSetStatusOpen(true);
  };

  const handleSaveSetStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAircraft) return;

    try {
      await aircraftService.setStatus(selectedAircraft.id, {
        status: modalStatus,
        reason: modalReason,
        startDate: modalStartDate,
        endDate: modalEndDate,
      });
    } catch (err) {
      console.error('Failed to save status on server:', err);
    }

    const updated: Aircraft = {
      ...selectedAircraft,
      status: modalStatus,
      statusReason: modalReason,
      statusStartDate: modalStartDate,
      statusEndDate: modalEndDate,
    };

    setSelectedAircraft(updated);
    setAircrafts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    setIsSetStatusOpen(false);
  };

  const handleSaveSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAircraft) return;

    try {
      await aircraftService.scheduleMaintenance(selectedAircraft.id, {
        maintenanceType: scheduleCheckType,
        startDate: scheduleStart,
        endDate: scheduleEnd,
      });
    } catch (err) {
      console.error('Failed to schedule maintenance on server:', err);
    }

    const updated: Aircraft = {
      ...selectedAircraft,
      status: 'In maintenance',
      maintenanceType: scheduleCheckType,
      maintenanceStart: scheduleStart,
      maintenanceEnd: scheduleEnd,
      statusStartDate: scheduleStart,
      statusEndDate: scheduleEnd,
    };

    setSelectedAircraft(updated);
    setAircrafts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    setIsScheduleOpen(false);
  };

  const handleModelChange = (modelCode: string) => {
    setNewModel(modelCode);
    const found = availableAircraftTypes.find((t) => t.code === modelCode);
    if (found) {
      setNewCapacity(found.capacity);
    }
  };

  const handleRegisterAircraft = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTailNumber.trim()) return;

    try {
      const created = await aircraftService.create({
        tailNumber: newTailNumber.toUpperCase(),
        model: newModel,
        base: newBase,
        capacity: Number(newCapacity),
        entryDate: newEntryDate,
      });
      setAircrafts((prev) => [created, ...prev]);
      setSelectedAircraft(created);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to register aircraft';
      alert(`Registration error: ${msg}`);
      const fallback: Aircraft = {
        id: Date.now().toString(),
        tailNumber: newTailNumber.toUpperCase(),
        model: newModel,
        base: newBase,
        capacity: Number(newCapacity),
        status: 'In service',
        retiredOn: null,
        entryIntoService: newEntryDate,
      };
      setAircrafts((prev) => [fallback, ...prev]);
      setSelectedAircraft(fallback);
    }

    setIsRegisterOpen(false);
    setNewTailNumber('');
  };

  const getStatusBadgeStyle = (st: Aircraft['status']) => {
    switch (st) {
      case 'In service':
        return {
          backgroundColor: '#e6f4ea',
          color: '#137333',
          padding: '4px 10px',
          borderRadius: '12px',
          fontSize: '12px',
          fontWeight: 500,
        };
      case 'In maintenance':
        return {
          backgroundColor: '#fef7e0',
          color: '#b06000',
          padding: '4px 10px',
          borderRadius: '12px',
          fontSize: '12px',
          fontWeight: 500,
        };
      case 'Grounded':
        return {
          backgroundColor: '#fce8e6',
          color: '#c5221f',
          padding: '4px 10px',
          borderRadius: '12px',
          fontSize: '12px',
          fontWeight: 500,
        };
      default:
        return {
          backgroundColor: '#f1f3f4',
          color: '#5f6368',
          padding: '4px 10px',
          borderRadius: '12px',
          fontSize: '12px',
          fontWeight: 500,
        };
    }
  };

  const filteredAircrafts = aircrafts.filter(
    (a) =>
      a.tailNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.model.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.base.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const currentSelectedDays = selectedAircraft
    ? operatingDays[selectedAircraft.id] || daysOfWeek
    : [];

  return (
    <div
      style={{
        padding: '24px',
        backgroundColor: '#f4f5f7',
        minHeight: '100vh',
        fontFamily: 'sans-serif',
        color: '#333',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px',
          borderBottom: '1px solid #ddd',
          paddingBottom: '12px',
        }}
      >
        <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold' }}>Flython Ops</h2>
          <Link
            to="/aircraft"
            style={{
              backgroundColor: '#e8f0fe',
              color: '#1a73e8',
              padding: '6px 12px',
              borderRadius: '6px',
              fontWeight: 'bold',
              fontSize: '14px',
              textDecoration: 'none',
            }}
          >
            Fleet
          </Link>
          <Link
            to="/aircraft-types"
            style={{ color: '#5f6368', fontSize: '14px', textDecoration: 'none' }}
          >
            Aircraft Types
          </Link>
          <Link
            to="/readiness"
            style={{ color: '#5f6368', fontSize: '14px', textDecoration: 'none' }}
          >
            Readiness
          </Link>
        </div>
        <div style={{ fontSize: '13px', color: '#5f6368' }}>Staff · admin</div>
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px',
        }}
      >
        <input
          type="text"
          placeholder="Search tail number, type or base"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            width: '420px',
            padding: '10px 14px',
            borderRadius: '6px',
            border: '1px solid #dadce0',
            backgroundColor: '#fff',
            fontSize: '14px',
          }}
        />
        <button
          onClick={() => setIsRegisterOpen(true)}
          style={{
            backgroundColor: '#1a56db',
            color: '#fff',
            border: 'none',
            padding: '10px 20px',
            borderRadius: '6px',
            fontWeight: 'bold',
            fontSize: '14px',
            cursor: 'pointer',
          }}
        >
          + Register Aircraft
        </button>
      </div>

      {fetchError && (
        <div
          style={{
            padding: '10px 16px',
            marginBottom: '16px',
            backgroundColor: '#fce8e6',
            color: '#c5221f',
            borderRadius: '6px',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>⚠️</span>
            <span>{fetchError}</span>
          </div>
          <button
            onClick={handleRetry}
            style={{
              padding: '4px 12px',
              backgroundColor: '#c5221f',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              fontSize: '12px',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            Retry
          </button>
        </div>
      )}

      <div style={{ display: 'flex', gap: '20px' }}>
        <div
          style={{
            flex: 1.4,
            backgroundColor: '#fff',
            borderRadius: '8px',
            border: '1px solid #dadce0',
            overflow: 'hidden',
          }}
        >
          {isLoading ? (
            <div style={{ padding: '32px', textAlign: 'center', color: '#5f6368', fontSize: '14px' }}>
              Loading fleet data...
            </div>
          ) : filteredAircrafts.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', color: '#5f6368', fontSize: '14px' }}>
              No aircraft found. Click "+ Register Aircraft" to add one.
            </div>
          ) : (
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                textAlign: 'left',
                fontSize: '13px',
              }}
            >
              <thead>
                <tr
                  style={{
                    borderBottom: '1px solid #dadce0',
                    color: '#5f6368',
                    backgroundColor: '#fff',
                  }}
                >
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Tail #</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Type</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Base</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Retired on</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredAircrafts.map((aircraft) => (
                  <tr
                    key={aircraft.id}
                    onClick={() => void handleSelectAircraft(aircraft)}
                    style={{
                      borderBottom: '1px solid #f1f3f4',
                      backgroundColor: selectedAircraft?.id === aircraft.id ? '#e8f0fe' : '#fff',
                      cursor: 'pointer',
                    }}
                  >
                    <td style={{ padding: '14px 16px', fontWeight: 'bold' }}>
                      {aircraft.tailNumber}
                    </td>
                    <td style={{ padding: '14px 16px', color: '#3c4043' }}>{aircraft.model}</td>
                    <td style={{ padding: '14px 16px', color: '#3c4043' }}>{aircraft.base}</td>
                    <td style={{ padding: '14px 16px', color: '#3c4043' }}>
                      {aircraft.retiredOn || '—'}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <span style={getStatusBadgeStyle(aircraft.status)}>{aircraft.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div
          style={{
            flex: 1,
            backgroundColor: '#fff',
            padding: '24px',
            borderRadius: '8px',
            border: '1px solid #dadce0',
          }}
        >
          {selectedAircraft ? (
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: '16px',
                }}
              >
                <div>
                  <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 'bold' }}>
                    {selectedAircraft.tailNumber}
                  </h2>
                  <p style={{ margin: '4px 0 0 0', color: '#5f6368', fontSize: '13px' }}>
                    {selectedAircraft.model} · base {selectedAircraft.base}
                  </p>
                </div>
                <button
                  onClick={handleOpenSetStatus}
                  style={{
                    border: '1px solid #dadce0',
                    background: '#fff',
                    padding: '8px 16px',
                    borderRadius: '6px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    fontSize: '13px',
                    color: '#1a73e8',
                  }}
                >
                  Set Status
                </button>
              </div>

              <div style={{ marginBottom: '8px' }}>
                <span style={getStatusBadgeStyle(selectedAircraft.status)}>
                  {selectedAircraft.status}
                </span>
              </div>
              {selectedAircraft.status === 'In maintenance' && (
                <p style={{ margin: '4px 0 16px 0', fontSize: '12px', color: '#5f6368' }}>
                  {selectedAircraft.statusReason || 'Scheduled inspection'} ·{' '}
                  {selectedAircraft.statusStartDate} to {selectedAircraft.statusEndDate}
                </p>
              )}

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: '20px',
                  paddingTop: '12px',
                  borderTop: '1px solid #f1f3f4',
                }}
              >
                <span style={{ fontSize: '13px', color: '#5f6368' }}>Retired on</span>
                <span style={{ fontSize: '13px', fontWeight: 'bold' }}>
                  {selectedAircraft.retiredOn || '—'}
                </span>
              </div>
              <div style={{ marginTop: '8px', marginBottom: '20px' }}>
                <button
                  onClick={() => void handleToggleRetire()}
                  style={{
                    border: '1px solid #dadce0',
                    background: '#fff',
                    padding: '6px 14px',
                    borderRadius: '6px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    fontSize: '12px',
                  }}
                >
                  {selectedAircraft.retiredOn ? 'Reinstate aircraft' : 'Retire aircraft'}
                </button>
              </div>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  fontSize: '13px',
                  marginBottom: '24px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#5f6368' }}>Entry into service</span>
                  <span style={{ fontWeight: 'bold' }}>{selectedAircraft.entryIntoService}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#5f6368' }}>Base airport</span>
                  <span style={{ fontWeight: 'bold' }}>{selectedAircraft.base}</span>
                </div>
              </div>

              <div
                style={{
                  marginBottom: '24px',
                  borderTop: '1px solid #f1f3f4',
                  paddingTop: '16px',
                }}
              >
                <div
                  style={{
                    fontSize: '11px',
                    fontWeight: 'bold',
                    color: '#5f6368',
                    marginBottom: '10px',
                    letterSpacing: '0.5px',
                  }}
                >
                  OPERATING DAYS
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {daysOfWeek.map((day) => {
                    const isActive = currentSelectedDays.includes(day);
                    return (
                      <button
                        key={day}
                        onClick={() => void handleToggleDay(day)}
                        style={{
                          flex: 1,
                          padding: '8px 0',
                          borderRadius: '6px',
                          border: '1px solid #dadce0',
                          backgroundColor: isActive ? '#e8f0fe' : '#fff',
                          color: isActive ? '#1a73e8' : '#3c4043',
                          fontSize: '12px',
                          fontWeight: isActive ? 'bold' : 'normal',
                          cursor: 'pointer',
                        }}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
                <div style={{ fontSize: '11px', color: '#5f6368', marginTop: '6px' }}>
                  {currentSelectedDays.length === 7
                    ? 'Flies every day.'
                    : `Flies ${currentSelectedDays.length} days a week.`}
                </div>
              </div>

              <div
                style={{
                  marginBottom: '24px',
                  borderTop: '1px solid #f1f3f4',
                  paddingTop: '16px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '8px',
                  }}
                >
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 'bold',
                      color: '#5f6368',
                      letterSpacing: '0.5px',
                    }}
                  >
                    MAINTENANCE
                  </span>
                  <button
                    onClick={() => setIsScheduleOpen(true)}
                    style={{
                      border: '1px solid #dadce0',
                      background: '#fff',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      color: '#1a73e8',
                    }}
                  >
                    + Schedule
                  </button>
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '12px',
                    color: '#3c4043',
                  }}
                >
                  <span>
                    {selectedAircraft.maintenanceType
                      ? `${selectedAircraft.maintenanceType} · planned`
                      : 'No scheduled maintenance'}
                  </span>
                  <span style={{ color: '#5f6368' }}>
                    {selectedAircraft.maintenanceStart
                      ? `${selectedAircraft.maintenanceStart} to ${selectedAircraft.maintenanceEnd}`
                      : ''}
                  </span>
                </div>
              </div>

              <div style={{ borderTop: '1px solid #f1f3f4', paddingTop: '16px' }}>
                <div
                  style={{
                    fontSize: '11px',
                    fontWeight: 'bold',
                    color: '#5f6368',
                    marginBottom: '8px',
                    letterSpacing: '0.5px',
                  }}
                >
                  STATUS HISTORY
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '12px',
                    color: '#3c4043',
                  }}
                >
                  <span>{selectedAircraft.status}</span>
                  <span style={{ color: '#5f6368' }}>Current status period</span>
                </div>
              </div>
            </div>
          ) : (
            <p style={{ color: '#5f6368', textAlign: 'center' }}>
              Select an aircraft to view details
            </p>
          )}
        </div>
      </div>

      {isSetStatusOpen && selectedAircraft && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              backgroundColor: '#fff',
              padding: '24px',
              borderRadius: '12px',
              width: '420px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: '16px', fontSize: '16px', fontWeight: 'bold' }}>
              Set Status · {selectedAircraft.tailNumber}
            </h3>
            <form onSubmit={(e) => void handleSaveSetStatus(e)}>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: '#5f6368' }}>
                  Status
                </label>
                <select
                  value={modalStatus}
                  onChange={(e) => setModalStatus(e.target.value as AircraftStatus)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '6px',
                    border: '1px solid #dadce0',
                    backgroundColor: '#fff',
                    fontSize: '14px',
                  }}
                >
                  <option value="In service">In service</option>
                  <option value="Grounded">Grounded</option>
                  <option value="In maintenance">In maintenance</option>
                </select>
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: '#5f6368' }}>
                  Reason
                </label>
                <input
                  type="text"
                  placeholder="e.g. Scheduled inspection"
                  value={modalReason}
                  onChange={(e) => setModalReason(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid #dadce0',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '11px', color: '#5f6368' }}>
                    Start date
                  </label>
                  <input
                    type="date"
                    value={modalStartDate}
                    onChange={(e) => setModalStartDate(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      border: '1px solid #dadce0',
                      fontSize: '13px',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '11px', color: '#5f6368' }}>
                    End date (optional)
                  </label>
                  <input
                    type="date"
                    value={modalEndDate}
                    onChange={(e) => setModalEndDate(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      border: '1px solid #dadce0',
                      fontSize: '13px',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setIsSetStatusOpen(false)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '6px',
                    border: '1px solid #dadce0',
                    background: '#fff',
                    cursor: 'pointer',
                    fontSize: '13px',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '8px 20px',
                    borderRadius: '6px',
                    border: 'none',
                    background: '#1a56db',
                    color: '#fff',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    fontSize: '13px',
                  }}
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isScheduleOpen && selectedAircraft && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              backgroundColor: '#fff',
              padding: '24px',
              borderRadius: '12px',
              width: '420px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: '16px', fontSize: '16px', fontWeight: 'bold' }}>
              Schedule Maintenance · {selectedAircraft.tailNumber}
            </h3>
            <form onSubmit={(e) => void handleSaveSchedule(e)}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', color: '#5f6368' }}>
                  Check type
                </label>
                <select
                  value={scheduleCheckType}
                  onChange={(e) => setScheduleCheckType(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '6px',
                    border: '1px solid #dadce0',
                    backgroundColor: '#fff',
                    fontSize: '14px',
                  }}
                >
                  <option value="A check">A check</option>
                  <option value="C check">C check</option>
                  <option value="Heavy Maintenance">Heavy Maintenance</option>
                  <option value="Scheduled inspection">Scheduled inspection</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '11px', color: '#5f6368' }}>
                    Planned start
                  </label>
                  <input
                    type="date"
                    value={scheduleStart}
                    onChange={(e) => setScheduleStart(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      border: '1px solid #dadce0',
                      fontSize: '13px',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '11px', color: '#5f6368' }}>
                    Planned end
                  </label>
                  <input
                    type="date"
                    value={scheduleEnd}
                    onChange={(e) => setScheduleEnd(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      border: '1px solid #dadce0',
                      fontSize: '13px',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setIsScheduleOpen(false)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '6px',
                    border: '1px solid #dadce0',
                    background: '#fff',
                    cursor: 'pointer',
                    fontSize: '13px',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '8px 20px',
                    borderRadius: '6px',
                    border: 'none',
                    background: '#1a56db',
                    color: '#fff',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    fontSize: '13px',
                  }}
                >
                  Schedule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isRegisterOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              backgroundColor: '#fff',
              padding: '24px',
              borderRadius: '12px',
              width: '420px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: '16px', fontSize: '16px', fontWeight: 'bold' }}>
              Register Aircraft
            </h3>
            <form onSubmit={(e) => void handleRegisterAircraft(e)}>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: '#5f6368' }}>
                  Tail number (with registration)
                </label>
                <input
                  type="text"
                  placeholder="e.g. HS-ABF"
                  value={newTailNumber}
                  onChange={(e) => setNewTailNumber(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid #dadce0',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: '#5f6368' }}>
                    Aircraft type
                  </label>
                  <select
                    value={newModel}
                    onChange={(e) => handleModelChange(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      border: '1px solid #dadce0',
                      backgroundColor: '#fff',
                      fontSize: '14px',
                      boxSizing: 'border-box',
                    }}
                  >
                    {availableAircraftTypes.map((t) => (
                      <option key={t.code} value={t.code}>
                        {t.code}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: '#5f6368' }}>
                    Base airport
                  </label>
                  <input
                    type="text"
                    value={newBase}
                    onChange={(e) => setNewBase(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      border: '1px solid #dadce0',
                      fontSize: '14px',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: '#5f6368' }}>
                  Entry into service
                </label>
                <input
                  type="date"
                  value={newEntryDate}
                  onChange={(e) => setNewEntryDate(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid #dadce0',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setIsRegisterOpen(false)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '6px',
                    border: '1px solid #dadce0',
                    background: '#fff',
                    cursor: 'pointer',
                    fontSize: '13px',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '8px 20px',
                    borderRadius: '6px',
                    border: 'none',
                    background: '#1a56db',
                    color: '#fff',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    fontSize: '13px',
                  }}
                >
                  Register
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

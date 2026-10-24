import React, { useState, useEffect } from 'react';
import { Link } from '@tanstack/react-router';
import type { AircraftType } from '../types/aircraftType';
import { aircraftTypeService } from '../services/aircraftTypeService';

interface CabinConfig {
  id: string;
  name: string;
  firstRow: number;
  lastRow: number;
  layoutPattern: string;
  rowSeats: string[];
}


export const AircraftTypesPage: React.FC = () => {
  const [aircraftTypes, setAircraftTypes] = useState<AircraftType[]>([]);
  const [selectedType, setSelectedType] = useState<AircraftType | null>(null);
  const [isEditorMode, setIsEditorMode] = useState<boolean>(false);
  const [editorTitle, setEditorTitle] = useState<string>('New Aircraft Type');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    code: 'A320',
    manufacturer: 'Airbus',
    model: 'A320',
    hold_weight_limit_kg: 9435,
    max_takeoff_weight_kg: 78000,
    max_range_km: 6100,
    min_turnaround_minutes: 45,
    operating_cost_per_hour: 5200,
    cost_currency: 'USD',
  });

  const [cabins, setCabins] = useState<CabinConfig[]>([
    { id: '1', name: 'Business', firstRow: 1, lastRow: 3, layoutPattern: '2-2', rowSeats: ['A', 'B', 'D', 'E'] },
    { id: '2', name: 'Economy', firstRow: 4, lastRow: 26, layoutPattern: '3-3', rowSeats: ['A', 'B', 'C', 'D', 'E', 'F'] },
  ]);

  const [newCabinName, setNewCabinName] = useState('Economy');
  const [newCabinFirstRow, setNewCabinFirstRow] = useState(1);
  const [newCabinLastRow, setNewCabinLastRow] = useState(30);
  const [newCabinLayout, setNewCabinLayout] = useState('2 - 3 - 2 (AB | DEF | GH)');

  const [blockedSeats, setBlockedSeats] = useState<Set<string>>(new Set(['3D', '3E']));

  // Load real aircraft types on mount
  useEffect(() => {
    let cancelled = false;

    async function loadTypes() {
      setIsLoading(true);
      setFetchError(null);
      try {
        const list = await aircraftTypeService.getAll();
        if (!cancelled) {
          if (list.length > 0) {
            setAircraftTypes(list);
            setSelectedType(list[0]);
          } else {
            // Default baseline if DB is completely empty
            const defaults: AircraftType[] = [
              {
                code: 'A320',
                manufacturer: 'Airbus',
                model: 'A320',
                hold_weight_limit_kg: 9435,
                max_takeoff_weight_kg: 78000,
                max_range_km: 6100,
                min_turnaround_minutes: 45,
                operating_cost_per_hour: 5200,
                cost_currency: 'USD',
                is_active: true,
                layout: { cabins: [] },
              },
            ];
            setAircraftTypes(defaults);
            setSelectedType(defaults[0]);
          }
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : 'Failed to load aircraft types';
          console.error(msg);
          setFetchError(msg);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadTypes();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleOpenNewEditor = () => {
    setEditorTitle('New Aircraft Type');
    setFormData({
      code: '',
      manufacturer: '',
      model: '',
      hold_weight_limit_kg: 4000,
      max_takeoff_weight_kg: 78000,
      max_range_km: 6000,
      min_turnaround_minutes: 45,
      operating_cost_per_hour: 5000,
      cost_currency: 'USD',
    });
    setCabins([
      { id: '1', name: 'Business', firstRow: 1, lastRow: 3, layoutPattern: '2-2', rowSeats: ['A', 'B', 'D', 'E'] },
      { id: '2', name: 'Economy', firstRow: 4, lastRow: 26, layoutPattern: '3-3', rowSeats: ['A', 'B', 'C', 'D', 'E', 'F'] },
    ]);
    setBlockedSeats(new Set());
    setIsEditorMode(true);
  };

  const handleOpenCloneEditor = (type: AircraftType) => {
    setEditorTitle(`New Aircraft Type (Cloned from ${type.code})`);
    setFormData({
      code: `${type.code}-CLONE`,
      manufacturer: type.manufacturer,
      model: `${type.model} (Copy)`,
      hold_weight_limit_kg: type.hold_weight_limit_kg,
      max_takeoff_weight_kg: type.max_takeoff_weight_kg,
      max_range_km: type.max_range_km,
      min_turnaround_minutes: type.min_turnaround_minutes,
      operating_cost_per_hour: type.operating_cost_per_hour,
      cost_currency: type.cost_currency,
    });
    setCabins([
      { id: '1', name: 'Business', firstRow: 1, lastRow: 3, layoutPattern: '2-2', rowSeats: ['A', 'B', 'D', 'E'] },
      { id: '2', name: 'Economy', firstRow: 4, lastRow: 26, layoutPattern: '3-3', rowSeats: ['A', 'B', 'C', 'D', 'E', 'F'] },
    ]);
    setBlockedSeats(new Set(['3D', '3E']));
    setIsEditorMode(true);
  };

  const handleToggleActive = async (code: string) => {
    const target = aircraftTypes.find((t) => t.code === code);
    const newActive = target ? !target.is_active : false;

    if (target?.id) {
      try {
        await aircraftTypeService.update(target.id, { is_active: newActive });
      } catch (err) {
        console.error('Failed to update type active status:', err);
      }
    }

    setAircraftTypes((prev) =>
      prev.map((t) => (t.code === code ? { ...t, is_active: newActive } : t))
    );
    if (selectedType && selectedType.code === code) {
      setSelectedType({ ...selectedType, is_active: newActive });
    }
  };

  const handleRemoveCabin = (id: string) => {
    setCabins(cabins.filter((c) => c.id !== id));
  };

  const handleAddCabin = () => {
    if (!newCabinName.trim()) return;
    let pattern = '3-3';
    let seats = ['A', 'B', 'C', 'D', 'E', 'F'];
    if (newCabinLayout.includes('2 - 2')) {
      pattern = '2-2';
      seats = ['A', 'B', 'D', 'E'];
    } else if (newCabinLayout.includes('2 - 3 - 2')) {
      pattern = '2-3-2';
      seats = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
    }
    const newCabin: CabinConfig = {
      id: Date.now().toString(),
      name: newCabinName,
      firstRow: Number(newCabinFirstRow),
      lastRow: Number(newCabinLastRow),
      layoutPattern: pattern,
      rowSeats: seats,
    };
    setCabins([...cabins, newCabin]);
  };

  const handleToggleSeatBlock = (seatId: string) => {
    const updated = new Set(blockedSeats);
    if (updated.has(seatId)) {
      updated.delete(seatId);
    } else {
      updated.add(seatId);
    }
    setBlockedSeats(updated);
  };

  let totalSeats = 0;
  cabins.forEach((c) => {
    const rowCount = c.lastRow - c.firstRow + 1;
    const seatCount = c.layoutPattern === '2-3-2' ? 7 : c.layoutPattern === '2-2' ? 4 : 6;
    totalSeats += rowCount * seatCount;
  });
  const blockedCount = blockedSeats.size;
  const sellableCount = totalSeats - blockedCount;

  const handleSaveAircraftType = async () => {
    if (!formData.code.trim()) return;

    // Convert cabin configs to layout format required by backend
    const layoutCabins = cabins.map((c) => {
      let cabinClass: 'first' | 'business' | 'premium_economy' | 'economy' = 'economy';
      const lower = c.name.toLowerCase();
      if (lower.includes('business')) cabinClass = 'business';
      else if (lower.includes('first')) cabinClass = 'first';
      else if (lower.includes('premium')) cabinClass = 'premium_economy';

      const aisleAfter: string[] = [];
      if (c.layoutPattern === '2-2' && c.rowSeats.includes('B')) aisleAfter.push('B');
      if (c.layoutPattern === '3-3' && c.rowSeats.includes('C')) aisleAfter.push('C');
      if (c.layoutPattern === '2-3-2') {
        if (c.rowSeats.includes('B')) aisleAfter.push('B');
        if (c.rowSeats.includes('E')) aisleAfter.push('E');
      }

      return {
        cabin_class: cabinClass,
        first_row: c.firstRow,
        last_row: c.lastRow,
        columns: c.rowSeats,
        aisle_after: aisleAfter,
        blocked_seats: Array.from(blockedSeats),
      };
    });

    layoutCabins.sort((a, b) => a.first_row - b.first_row);

    const payload = {
      code: formData.code.trim().toUpperCase(),
      manufacturer: formData.manufacturer.trim(),
      model: formData.model.trim(),
      hold_weight_limit_kg: Math.round(Number(formData.hold_weight_limit_kg)),
      max_takeoff_weight_kg: Math.round(Number(formData.max_takeoff_weight_kg)),
      max_range_km: Math.round(Number(formData.max_range_km)),
      min_turnaround_minutes: Math.round(Number(formData.min_turnaround_minutes)),
      operating_cost_per_hour: Number(formData.operating_cost_per_hour),
      cost_currency: formData.cost_currency || 'USD',
      is_active: true,
      layout: {
        cabins: layoutCabins,
      },
    };

    try {
      const created = await aircraftTypeService.create(payload);
      setAircraftTypes((prev) => [created, ...prev]);
      setSelectedType(created);
      setIsEditorMode(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save aircraft type';
      alert(`Save error: ${msg}`);
    }
  };

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
      {/* Top Navbar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px',
          borderBottom: '1px solid #ddd',
          paddingBottom: '12px',
          backgroundColor: '#fff',
          padding: '12px 24px',
          borderRadius: '8px',
        }}
      >
        <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold' }}>Flython Ops</h2>
          <Link
            to="/aircraft"
            style={{ color: '#5f6368', fontSize: '14px', textDecoration: 'none' }}
          >
            Fleet
          </Link>
          <Link
            to="/aircraft-types"
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

      {fetchError && (
        <div
          style={{
            padding: '10px 16px',
            marginBottom: '16px',
            backgroundColor: '#fce8e6',
            color: '#c5221f',
            borderRadius: '6px',
            fontSize: '13px',
          }}
        >
          ⚠️ {fetchError}
        </div>
      )}

      {!isEditorMode ? (
        <div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px',
            }}
          >
            <div>
              <h1 style={{ fontSize: '20px', fontWeight: 'bold', margin: 0 }}>Aircraft types</h1>
              <p style={{ fontSize: '13px', color: '#5f6368', margin: '4px 0 0 0' }}>
                Each type's seat map layout is set once, at creation. To change a layout, clone the
                type and retire the old one.
              </p>
            </div>
            <button
              onClick={handleOpenNewEditor}
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
              + New Aircraft Type
            </button>
          </div>

          <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
            <div
              style={{
                flex: 1.5,
                backgroundColor: '#fff',
                borderRadius: '8px',
                border: '1px solid #dadce0',
                overflow: 'hidden',
              }}
            >
              {isLoading ? (
                <div style={{ padding: '32px', textAlign: 'center', color: '#5f6368' }}>
                  Loading aircraft types...
                </div>
              ) : aircraftTypes.length === 0 ? (
                <div style={{ padding: '32px', textAlign: 'center', color: '#5f6368' }}>
                  No aircraft types found.
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
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>Code</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>Manufacturer / Model</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>Hold limit</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>Turnaround</th>
                      <th style={{ padding: '12px 16px', fontWeight: 600 }}>Cost / hour</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aircraftTypes.map((type) => (
                      <tr
                        key={type.code}
                        onClick={() => setSelectedType(type)}
                        style={{
                          borderBottom: '1px solid #f1f3f4',
                          backgroundColor: selectedType?.code === type.code ? '#e8f0fe' : '#fff',
                          cursor: 'pointer',
                        }}
                      >
                        <td style={{ padding: '14px 16px', fontWeight: 'bold' }}>{type.code}</td>
                        <td style={{ padding: '14px 16px', color: '#3c4043' }}>
                          {type.manufacturer} {type.model}
                        </td>
                        <td style={{ padding: '14px 16px', color: '#3c4043' }}>
                          {type.hold_weight_limit_kg.toLocaleString()} kg
                        </td>
                        <td style={{ padding: '14px 16px', color: '#3c4043' }}>
                          {type.min_turnaround_minutes} min
                        </td>
                        <td style={{ padding: '14px 16px', color: '#3c4043' }}>
                          {type.cost_currency} {type.operating_cost_per_hour.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {selectedType && (
              <div
                style={{
                  flex: 1,
                  backgroundColor: '#fff',
                  padding: '24px',
                  borderRadius: '8px',
                  border: '1px solid #dadce0',
                  boxSizing: 'border-box',
                }}
              >
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
                      {selectedType.code}
                    </h2>
                    <p style={{ margin: '4px 0 0 0', color: '#5f6368', fontSize: '13px' }}>
                      {selectedType.manufacturer} {selectedType.model}
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedType(null)}
                    style={{
                      border: '1px solid #dadce0',
                      background: '#fff',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    Close
                  </button>
                </div>

                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    fontSize: '13px',
                    marginBottom: '20px',
                    borderBottom: '1px solid #f1f3f4',
                    paddingBottom: '16px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#5f6368' }}>Max takeoff weight</span>
                    <span style={{ fontWeight: 'bold' }}>
                      {selectedType.max_takeoff_weight_kg.toLocaleString()} kg
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#5f6368' }}>Status</span>
                    <span
                      style={{
                        fontWeight: 'bold',
                        color: selectedType.is_active ? '#137333' : '#c5221f',
                      }}
                    >
                      {selectedType.is_active ? 'active' : 'retired (is_active = false)'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#5f6368' }}>Hold weight limit</span>
                    <span style={{ fontWeight: 'bold' }}>
                      {selectedType.hold_weight_limit_kg.toLocaleString()} kg
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#5f6368' }}>Max range</span>
                    <span style={{ fontWeight: 'bold' }}>
                      {selectedType.max_range_km.toLocaleString()} km
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#5f6368' }}>Min turnaround</span>
                    <span style={{ fontWeight: 'bold' }}>
                      {selectedType.min_turnaround_minutes} min
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#5f6368' }}>Operating cost</span>
                    <span style={{ fontWeight: 'bold' }}>
                      {selectedType.cost_currency}{' '}
                      {selectedType.operating_cost_per_hour.toLocaleString()} / hour
                    </span>
                  </div>
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <div
                    style={{
                      fontSize: '11px',
                      fontWeight: 'bold',
                      color: '#5f6368',
                      marginBottom: '8px',
                      letterSpacing: '0.5px',
                    }}
                  >
                    CABINS
                  </div>
                  {selectedType.layout?.cabins && selectedType.layout.cabins.length > 0 ? (
                    selectedType.layout.cabins.map((c, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          fontSize: '13px',
                          marginBottom: '6px',
                        }}
                      >
                        <span style={{ color: '#3c4043', textTransform: 'capitalize' }}>
                          {c.cabin_class} (rows {c.first_row}-{c.last_row})
                        </span>
                        <span style={{ color: '#5f6368' }}>
                          {c.last_row - c.first_row + 1} rows · {c.columns.join('')}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div style={{ fontSize: '13px', color: '#5f6368' }}>
                      Standard seat layout (rows 1-30)
                    </div>
                  )}
                </div>

                <div
                  style={{
                    backgroundColor: '#fef7e0',
                    border: '1px solid #fce8b2',
                    padding: '12px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    color: '#b06000',
                    marginBottom: '20px',
                    lineHeight: '1.4',
                  }}
                >
                  Layout is locked. To change it, clone this type (the clone starts with this layout)
                  and retire the old one.
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    onClick={() => handleOpenCloneEditor(selectedType)}
                    style={{
                      backgroundColor: '#1a56db',
                      color: '#fff',
                      border: 'none',
                      padding: '8px 16px',
                      borderRadius: '6px',
                      fontWeight: 'bold',
                      fontSize: '13px',
                      cursor: 'pointer',
                    }}
                  >
                    Clone type
                  </button>
                  <button
                    onClick={() => void handleToggleActive(selectedType.code)}
                    style={{
                      border: '1px solid #dadce0',
                      background: '#fff',
                      color: '#3c4043',
                      padding: '8px 16px',
                      borderRadius: '6px',
                      fontWeight: 'bold',
                      fontSize: '13px',
                      cursor: 'pointer',
                    }}
                  >
                    {selectedType.is_active ? 'Retire type' : 'Reactivate type'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div>
          <button
            onClick={() => setIsEditorMode(false)}
            style={{
              background: 'none',
              border: 'none',
              color: '#5f6368',
              fontSize: '13px',
              cursor: 'pointer',
              padding: 0,
              marginBottom: '8px',
            }}
          >
            ← Aircraft Types
          </button>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px',
            }}
          >
            <h1 style={{ fontSize: '20px', fontWeight: 'bold', margin: 0 }}>{editorTitle}</h1>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setIsEditorMode(false)}
                style={{
                  border: '1px solid #dadce0',
                  background: '#fff',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => void handleSaveAircraftType()}
                style={{
                  backgroundColor: '#1a56db',
                  color: '#fff',
                  border: 'none',
                  padding: '8px 20px',
                  borderRadius: '6px',
                  fontWeight: 'bold',
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                Save Type & Layout
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
            <div
              style={{
                flex: 1,
                backgroundColor: '#fff',
                padding: '24px',
                borderRadius: '8px',
                border: '1px solid #dadce0',
              }}
            >
              <h3 style={{ margin: '0 0 16px 0', fontSize: '15px', fontWeight: 'bold' }}>
                Specification
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '12px',
                      color: '#5f6368',
                      marginBottom: '4px',
                    }}
                  >
                    IATA / Type Code
                  </label>
                  <input
                    type="text"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '8px',
                      borderRadius: '6px',
                      border: '1px solid #dadce0',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '12px',
                      color: '#5f6368',
                      marginBottom: '4px',
                    }}
                  >
                    Manufacturer
                  </label>
                  <input
                    type="text"
                    value={formData.manufacturer}
                    onChange={(e) => setFormData({ ...formData, manufacturer: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '8px',
                      borderRadius: '6px',
                      border: '1px solid #dadce0',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '12px',
                      color: '#5f6368',
                      marginBottom: '4px',
                    }}
                  >
                    Model
                  </label>
                  <input
                    type="text"
                    value={formData.model}
                    onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '8px',
                      borderRadius: '6px',
                      border: '1px solid #dadce0',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '12px',
                      color: '#5f6368',
                      marginBottom: '4px',
                    }}
                  >
                    Hold limit (kg)
                  </label>
                  <input
                    type="number"
                    value={formData.hold_weight_limit_kg}
                    onChange={(e) =>
                      setFormData({ ...formData, hold_weight_limit_kg: Number(e.target.value) })
                    }
                    style={{
                      width: '100%',
                      padding: '8px',
                      borderRadius: '6px',
                      border: '1px solid #dadce0',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '12px',
                      color: '#5f6368',
                      marginBottom: '4px',
                    }}
                  >
                    Max takeoff weight (kg)
                  </label>
                  <input
                    type="number"
                    value={formData.max_takeoff_weight_kg}
                    onChange={(e) =>
                      setFormData({ ...formData, max_takeoff_weight_kg: Number(e.target.value) })
                    }
                    style={{
                      width: '100%',
                      padding: '8px',
                      borderRadius: '6px',
                      border: '1px solid #dadce0',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '12px',
                      color: '#5f6368',
                      marginBottom: '4px',
                    }}
                  >
                    Max range (km)
                  </label>
                  <input
                    type="number"
                    value={formData.max_range_km}
                    onChange={(e) =>
                      setFormData({ ...formData, max_range_km: Number(e.target.value) })
                    }
                    style={{
                      width: '100%',
                      padding: '8px',
                      borderRadius: '6px',
                      border: '1px solid #dadce0',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '12px',
                      color: '#5f6368',
                      marginBottom: '4px',
                    }}
                  >
                    Min turnaround (min)
                  </label>
                  <input
                    type="number"
                    value={formData.min_turnaround_minutes}
                    onChange={(e) =>
                      setFormData({ ...formData, min_turnaround_minutes: Number(e.target.value) })
                    }
                    style={{
                      width: '100%',
                      padding: '8px',
                      borderRadius: '6px',
                      border: '1px solid #dadce0',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '12px',
                      color: '#5f6368',
                      marginBottom: '4px',
                    }}
                  >
                    Operating cost / hour
                  </label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      value={formData.cost_currency}
                      onChange={(e) => setFormData({ ...formData, cost_currency: e.target.value })}
                      style={{
                        width: '70px',
                        padding: '8px',
                        borderRadius: '6px',
                        border: '1px solid #dadce0',
                        boxSizing: 'border-box',
                      }}
                    />
                    <input
                      type="number"
                      value={formData.operating_cost_per_hour}
                      onChange={(e) =>
                        setFormData({ ...formData, operating_cost_per_hour: Number(e.target.value) })
                      }
                      style={{
                        flex: 1,
                        padding: '8px',
                        borderRadius: '6px',
                        border: '1px solid #dadce0',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                </div>
              </div>

              <div style={{ borderTop: '1px solid #dadce0', marginTop: '24px', paddingTop: '16px' }}>
                <h3 style={{ margin: '0 0 12px 0', fontSize: '15px', fontWeight: 'bold' }}>
                  Cabins
                </h3>
                {cabins.map((cabin) => (
                  <div
                    key={cabin.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      backgroundColor: '#f8f9fa',
                      padding: '10px 14px',
                      borderRadius: '6px',
                      marginBottom: '8px',
                    }}
                  >
                    <div>
                      <span style={{ fontWeight: 'bold', fontSize: '13px' }}>{cabin.name}</span>
                      <span style={{ fontSize: '12px', color: '#5f6368', marginLeft: '8px' }}>
                        Rows {cabin.firstRow}–{cabin.lastRow} · {cabin.layoutPattern} (
                        {cabin.rowSeats.join('')})
                      </span>
                    </div>
                    <button
                      onClick={() => handleRemoveCabin(cabin.id)}
                      style={{
                        color: '#c5221f',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '13px',
                      }}
                    >
                      Remove
                    </button>
                  </div>
                ))}

                <div
                  style={{
                    display: 'flex',
                    gap: '8px',
                    alignItems: 'center',
                    marginTop: '12px',
                    flexWrap: 'wrap',
                  }}
                >
                  <input
                    type="text"
                    placeholder="Cabin Name"
                    value={newCabinName}
                    onChange={(e) => setNewCabinName(e.target.value)}
                    style={{
                      width: '100px',
                      padding: '6px 8px',
                      borderRadius: '4px',
                      border: '1px solid #dadce0',
                      fontSize: '12px',
                    }}
                  />
                  <input
                    type="number"
                    placeholder="First"
                    value={newCabinFirstRow}
                    onChange={(e) => setNewCabinFirstRow(Number(e.target.value))}
                    style={{
                      width: '50px',
                      padding: '6px 8px',
                      borderRadius: '4px',
                      border: '1px solid #dadce0',
                      fontSize: '12px',
                    }}
                  />
                  <span>to</span>
                  <input
                    type="number"
                    placeholder="Last"
                    value={newCabinLastRow}
                    onChange={(e) => setNewCabinLastRow(Number(e.target.value))}
                    style={{
                      width: '50px',
                      padding: '6px 8px',
                      borderRadius: '4px',
                      border: '1px solid #dadce0',
                      fontSize: '12px',
                    }}
                  />
                  <select
                    value={newCabinLayout}
                    onChange={(e) => setNewCabinLayout(e.target.value)}
                    style={{
                      padding: '6px 8px',
                      borderRadius: '4px',
                      border: '1px solid #dadce0',
                      fontSize: '12px',
                    }}
                  >
                    <option value="2 - 2 (AB | DE)">2 - 2 (AB | DE)</option>
                    <option value="3 - 3 (ABC | DEF)">3 - 3 (ABC | DEF)</option>
                    <option value="2 - 3 - 2 (AB | DEF | GH)">2 - 3 - 2 (AB | DEF | GH)</option>
                  </select>
                  <button
                    onClick={handleAddCabin}
                    style={{
                      backgroundColor: '#fff',
                      border: '1px solid #dadce0',
                      padding: '6px 12px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: 'bold',
                    }}
                  >
                    Add Cabin
                  </button>
                </div>
              </div>
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
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '16px',
                }}
              >
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 'bold' }}>Seat Map Editor</h3>
                <span style={{ fontSize: '12px', color: '#5f6368' }}>
                  Total: {totalSeats} | Blocked: {blockedCount} | Sellable: {sellableCount}
                </span>
              </div>
              <p style={{ margin: '0 0 16px 0', fontSize: '12px', color: '#5f6368' }}>
                Click a seat to block or unblock it. Blocked seats are excluded from sellable capacity.
              </p>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  maxHeight: '400px',
                  overflowY: 'auto',
                  paddingRight: '8px',
                }}
              >
                {cabins.map((cabin) => {
                  const rows = [];
                  for (let r = cabin.firstRow; r <= Math.min(cabin.lastRow, cabin.firstRow + 8); r++) {
                    rows.push(r);
                  }
                  return (
                    <div key={cabin.id} style={{ marginBottom: '12px' }}>
                      <div
                        style={{
                          fontSize: '11px',
                          fontWeight: 'bold',
                          color: '#5f6368',
                          marginBottom: '4px',
                        }}
                      >
                        {cabin.name.toUpperCase()}
                      </div>
                      {rows.map((rowNum) => (
                        <div
                          key={rowNum}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            marginBottom: '4px',
                          }}
                        >
                          <span
                            style={{
                              width: '24px',
                              fontSize: '11px',
                              color: '#5f6368',
                              textAlign: 'right',
                              marginRight: '6px',
                            }}
                          >
                            {rowNum}
                          </span>
                          {cabin.rowSeats.map((seatLetter) => {
                            const seatId = `${rowNum}${seatLetter}`;
                            const isBlocked = blockedSeats.has(seatId);
                            return (
                              <button
                                key={seatLetter}
                                onClick={() => handleToggleSeatBlock(seatId)}
                                style={{
                                  width: '28px',
                                  height: '28px',
                                  borderRadius: '4px',
                                  border: '1px solid #dadce0',
                                  backgroundColor: isBlocked ? '#fce8e6' : '#e6f4ea',
                                  color: isBlocked ? '#c5221f' : '#137333',
                                  fontSize: '10px',
                                  fontWeight: 'bold',
                                  cursor: 'pointer',
                                }}
                              >
                                {seatLetter}
                              </button>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

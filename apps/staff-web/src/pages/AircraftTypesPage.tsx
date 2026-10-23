import React, { useState } from 'react';
import { Link } from '@tanstack/react-router';
import type { AircraftType } from '../types/aircraftType';

interface CabinConfig {
  id: string;
  name: string;
  firstRow: number;
  lastRow: number;
  layoutPattern: string;
  rowSeats: string[];
}

export const AircraftTypesPage: React.FC = () => {
  const [aircraftTypes, setAircraftTypes] = useState<AircraftType[]>([
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
      is_active: false,
      total_seats: 150,
      layout: { cabins: [] }
    },
    {
      code: 'A321',
      manufacturer: 'Airbus',
      model: 'A321',
      hold_weight_limit_kg: 11780,
      max_takeoff_weight_kg: 93500,
      max_range_km: 5900,
      min_turnaround_minutes: 55,
      operating_cost_per_hour: 6100,
      cost_currency: 'USD',
      is_active: true,
      total_seats: 220,
      layout: { cabins: [] }
    },
    {
      code: 'B738',
      manufacturer: 'Boeing',
      model: '737-800',
      hold_weight_limit_kg: 8940,
      max_takeoff_weight_kg: 79000,
      max_range_km: 5400,
      min_turnaround_minutes: 45,
      operating_cost_per_hour: 5000,
      cost_currency: 'USD',
      is_active: true,
      total_seats: 189,
      layout: { cabins: [] }
    }
  ]);

  const [selectedType, setSelectedType] = useState<AircraftType | null>(aircraftTypes[0]);
  const [isEditorMode, setIsEditorMode] = useState<boolean>(false);
  const [editorTitle, setEditorTitle] = useState<string>('New Aircraft Type');

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
    { id: '2', name: 'Economy', firstRow: 4, lastRow: 26, layoutPattern: '3-3', rowSeats: ['A', 'B', 'C', 'D', 'E', 'F'] }
  ]);

  const [newCabinName, setNewCabinName] = useState('Economy');
  const [newCabinFirstRow, setNewCabinFirstRow] = useState(1);
  const [newCabinLastRow, setNewCabinLastRow] = useState(30);
  const [newCabinLayout, setNewCabinLayout] = useState('2 - 3 - 2 (AB | DEF | GH)');

  const [blockedSeats, setBlockedSeats] = useState<Set<string>>(new Set(['3D', '3E']));

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
      { id: '2', name: 'Economy', firstRow: 4, lastRow: 26, layoutPattern: '3-3', rowSeats: ['A', 'B', 'C', 'D', 'E', 'F'] }
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
      { id: '2', name: 'Economy', firstRow: 4, lastRow: 26, layoutPattern: '3-3', rowSeats: ['A', 'B', 'C', 'D', 'E', 'F'] }
    ]);
    setBlockedSeats(new Set(['3D', '3E']));
    setIsEditorMode(true);
  };

  const handleToggleActive = (code: string) => {
    setAircraftTypes(
      aircraftTypes.map((t) => (t.code === code ? { ...t, is_active: !t.is_active } : t))
    );
    if (selectedType && selectedType.code === code) {
      setSelectedType({ ...selectedType, is_active: !selectedType.is_active });
    }
  };

  const handleRemoveCabin = (id: string) => {
    setCabins(cabins.filter(c => c.id !== id));
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
      rowSeats: seats
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
  cabins.forEach(c => {
    const rowCount = c.lastRow - c.firstRow + 1;
    const seatCount = c.layoutPattern === '2-3-2' ? 7 : (c.layoutPattern === '2-2' ? 4 : 6);
    totalSeats += rowCount * seatCount;
  });
  const blockedCount = blockedSeats.size;
  const sellableCount = totalSeats - blockedCount;

  const handleSaveAircraftType = () => {
    if (!formData.code.trim()) return;
    const newTypeObj: AircraftType = {
      code: formData.code,
      manufacturer: formData.manufacturer,
      model: formData.model,
      hold_weight_limit_kg: Number(formData.hold_weight_limit_kg),
      max_takeoff_weight_kg: Number(formData.max_takeoff_weight_kg),
      max_range_km: Number(formData.max_range_km),
      min_turnaround_minutes: Number(formData.min_turnaround_minutes),
      operating_cost_per_hour: Number(formData.operating_cost_per_hour),
      cost_currency: formData.cost_currency,
      is_active: true,
      total_seats: totalSeats,
      layout: { cabins: [] }
    };

    setAircraftTypes([newTypeObj, ...aircraftTypes]);
    setSelectedType(newTypeObj);
    setIsEditorMode(false);
  };

  return (
    <div style={{ padding: '24px', backgroundColor: '#f4f5f7', minHeight: '100vh', fontFamily: 'sans-serif', color: '#333' }}>
      {/* Top Navbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid #ddd', paddingBottom: '12px', backgroundColor: '#fff', padding: '12px 24px', borderRadius: '8px' }}>
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
            style={{ backgroundColor: '#e8f0fe', color: '#1a73e8', padding: '6px 12px', borderRadius: '6px', fontWeight: 'bold', fontSize: '14px', textDecoration: 'none' }}
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

      {!isEditorMode ? (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <h1 style={{ fontSize: '20px', fontWeight: 'bold', margin: 0 }}>Aircraft types</h1>
              <p style={{ fontSize: '13px', color: '#5f6368', margin: '4px 0 0 0' }}>
                Each type's seat map layout is set once, at creation. To change a layout, clone the type and retire the old one.
              </p>
            </div>
            <button 
              onClick={handleOpenNewEditor}
              style={{ backgroundColor: '#1a56db', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '6px', fontWeight: 'bold', fontSize: '14px', cursor: 'pointer' }}
            >
              + New Aircraft Type
            </button>
          </div>

          <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
            <div style={{ flex: 1.5, backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #dadce0', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #dadce0', color: '#5f6368', backgroundColor: '#fff' }}>
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Code</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Manufacturer / Model</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Hold limit</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Seats</th>
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
                        cursor: 'pointer' 
                      }}
                    >
                      <td style={{ padding: '14px 16px', fontWeight: 'bold' }}>{type.code}</td>
                      <td style={{ padding: '14px 16px', color: '#3c4043' }}>{type.manufacturer} {type.model}</td>
                      <td style={{ padding: '14px 16px', color: '#3c4043' }}>{type.hold_weight_limit_kg.toLocaleString()} kg</td>
                      <td style={{ padding: '14px 16px', color: '#3c4043' }}>{type.total_seats}</td>
                      <td style={{ padding: '14px 16px', color: '#3c4043' }}>{type.min_turnaround_minutes} min</td>
                      <td style={{ padding: '14px 16px', color: '#3c4043' }}>{type.cost_currency} {type.operating_cost_per_hour.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {selectedType && (
              <div style={{ flex: 1, backgroundColor: '#fff', padding: '24px', borderRadius: '8px', border: '1px solid #dadce0', boxSizing: 'border-box' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 'bold' }}>{selectedType.code}</h2>
                    <p style={{ margin: '4px 0 0 0', color: '#5f6368', fontSize: '13px' }}>{selectedType.manufacturer} {selectedType.model}</p>
                  </div>
                  <button 
                    onClick={() => setSelectedType(null)}
                    style={{ border: '1px solid #dadce0', background: '#fff', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}
                  >
                    Close
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px', marginBottom: '20px', borderBottom: '1px solid #f1f3f4', paddingBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#5f6368' }}>Max takeoff weight</span>
                    <span style={{ fontWeight: 'bold' }}>{selectedType.max_takeoff_weight_kg.toLocaleString()} kg</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#5f6368' }}>Status</span>
                    <span style={{ fontWeight: 'bold', color: selectedType.is_active ? '#137333' : '#c5221f' }}>
                      {selectedType.is_active ? 'active' : 'retired (is_active = false)'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#5f6368' }}>Hold weight limit</span>
                    <span style={{ fontWeight: 'bold' }}>{selectedType.hold_weight_limit_kg.toLocaleString()} kg</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#5f6368' }}>Max range</span>
                    <span style={{ fontWeight: 'bold' }}>{selectedType.max_range_km.toLocaleString()} km</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#5f6368' }}>Min turnaround</span>
                    <span style={{ fontWeight: 'bold' }}>{selectedType.min_turnaround_minutes} min</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#5f6368' }}>Operating cost</span>
                    <span style={{ fontWeight: 'bold' }}>{selectedType.cost_currency} {selectedType.operating_cost_per_hour.toLocaleString()} / hour</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#5f6368' }}>Total seats</span>
                    <span style={{ fontWeight: 'bold' }}>{selectedType.total_seats}</span>
                  </div>
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#5f6368', marginBottom: '8px', letterSpacing: '0.5px' }}>CABINS</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
                    <span style={{ color: '#3c4043' }}>Business (rows 1-4)</span>
                    <span style={{ color: '#5f6368' }}>4 rows · 2-2</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span style={{ color: '#3c4043' }}>Economy (rows 5-30)</span>
                    <span style={{ color: '#5f6368' }}>26 rows · 3-3</span>
                  </div>
                </div>

                <div style={{ backgroundColor: '#fef7e0', border: '1px solid #fce8b2', padding: '12px', borderRadius: '6px', fontSize: '12px', color: '#b06000', marginBottom: '20px', lineHeight: '1.4' }}>
                  Layout is locked. To change it, clone this type (the clone starts with this layout) and retire the old one.
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button 
                    onClick={() => handleOpenCloneEditor(selectedType)}
                    style={{ backgroundColor: '#1a56db', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', fontWeight: 'bold', fontSize: '13px', cursor: 'pointer' }}
                  >
                    Clone type
                  </button>
                  <button 
                    onClick={() => handleToggleActive(selectedType.code)}
                    style={{ border: '1px solid #dadce0', background: '#fff', color: '#3c4043', padding: '8px 16px', borderRadius: '6px', fontWeight: 'bold', fontSize: '13px', cursor: 'pointer' }}
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
            style={{ background: 'none', border: 'none', color: '#5f6368', fontSize: '13px', cursor: 'pointer', padding: 0, marginBottom: '8px' }}
          >
            ← Aircraft Types
          </button>
          <h1 style={{ fontSize: '20px', fontWeight: 'bold', margin: '0 0 20px 0' }}>{editorTitle}</h1>

          <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
            <div style={{ flex: 1.2, display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '8px', border: '1px solid #dadce0' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: '#5f6368', marginBottom: '4px' }}>Code</label>
                    <input 
                      type="text" 
                      value={formData.code} 
                      onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                      style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #dadce0', fontSize: '13px', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: '#5f6368', marginBottom: '4px' }}>Hold weight limit (kg)</label>
                    <input 
                      type="number" 
                      value={formData.hold_weight_limit_kg} 
                      onChange={(e) => setFormData({ ...formData, hold_weight_limit_kg: Number(e.target.value) })}
                      style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #dadce0', fontSize: '13px', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: '#5f6368', marginBottom: '4px' }}>Max takeoff weight (kg)</label>
                    <input 
                      type="number" 
                      value={formData.max_takeoff_weight_kg} 
                      onChange={(e) => setFormData({ ...formData, max_takeoff_weight_kg: Number(e.target.value) })}
                      style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #dadce0', fontSize: '13px', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: '#5f6368', marginBottom: '4px' }}>Manufacturer</label>
                    <input 
                      type="text" 
                      value={formData.manufacturer} 
                      onChange={(e) => setFormData({ ...formData, manufacturer: e.target.value })}
                      style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #dadce0', fontSize: '13px', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: '#5f6368', marginBottom: '4px' }}>Model</label>
                    <input 
                      type="text" 
                      value={formData.model} 
                      onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                      style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #dadce0', fontSize: '13px', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: '#5f6368', marginBottom: '4px' }}>Max range (km)</label>
                    <input 
                      type="number" 
                      value={formData.max_range_km} 
                      onChange={(e) => setFormData({ ...formData, max_range_km: Number(e.target.value) })}
                      style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #dadce0', fontSize: '13px', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: '#5f6368', marginBottom: '4px' }}>Min turnaround (min)</label>
                    <input 
                      type="number" 
                      value={formData.min_turnaround_minutes} 
                      onChange={(e) => setFormData({ ...formData, min_turnaround_minutes: Number(e.target.value) })}
                      style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #dadce0', fontSize: '13px', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: '#5f6368', marginBottom: '4px' }}>Operating cost per hour</label>
                    <input 
                      type="number" 
                      value={formData.operating_cost_per_hour} 
                      onChange={(e) => setFormData({ ...formData, operating_cost_per_hour: Number(e.target.value) })}
                      style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #dadce0', fontSize: '13px', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: '#5f6368', marginBottom: '4px' }}>Cost currency</label>
                    <input 
                      type="text" 
                      value={formData.cost_currency} 
                      onChange={(e) => setFormData({ ...formData, cost_currency: e.target.value })}
                      style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #dadce0', fontSize: '13px', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>
              </div>

              <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '8px', border: '1px solid #dadce0' }}>
                <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 'bold' }}>Cabins</h3>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                  {cabins.map((cabin) => (
                    <div key={cabin.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f8f9fa', padding: '10px 14px', borderRadius: '6px' }}>
                      <span style={{ fontSize: '13px', color: '#3c4043' }}>
                        <strong>{cabin.name}</strong> rows {cabin.firstRow}-{cabin.lastRow} · {cabin.layoutPattern}
                      </span>
                      <button 
                        onClick={() => handleRemoveCabin(cabin.id)}
                        style={{ border: 'none', background: 'none', color: '#c5221f', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>

                <div style={{ borderTop: '1px solid #f1f3f4', paddingTop: '12px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#5f6368', marginBottom: '8px' }}>ADD CABIN</div>
                  <div style={{ marginBottom: '8px' }}>
                    <label style={{ display: 'block', fontSize: '11px', color: '#5f6368', marginBottom: '4px' }}>Class name</label>
                    <input 
                      type="text" 
                      value={newCabinName}
                      onChange={(e) => setNewCabinName(e.target.value)}
                      style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #dadce0', fontSize: '13px', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '12px', marginBottom: '8px' }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: 'block', fontSize: '11px', color: '#5f6368', marginBottom: '4px' }}>First row</label>
                      <input 
                        type="number" 
                        value={newCabinFirstRow}
                        onChange={(e) => setNewCabinFirstRow(Number(e.target.value))}
                        style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #dadce0', fontSize: '13px', boxSizing: 'border-box' }}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: 'block', fontSize: '11px', color: '#5f6368', marginBottom: '4px' }}>Last row</label>
                      <input 
                        type="number" 
                        value={newCabinLastRow}
                        onChange={(e) => setNewCabinLastRow(Number(e.target.value))}
                        style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #dadce0', fontSize: '13px', boxSizing: 'border-box' }}
                      />
                    </div>
                  </div>
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', fontSize: '11px', color: '#5f6368', marginBottom: '4px' }}>Seat layout (letters, "|" marks the aisle)</label>
                    <select 
                      value={newCabinLayout}
                      onChange={(e) => setNewCabinLayout(e.target.value)}
                      style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #dadce0', backgroundColor: '#fff', fontSize: '13px', boxSizing: 'border-box' }}
                    >
                      <option value="2 - 2 (AB | DE)">2 - 2 (AB | DE)</option>
                      <option value="3 - 3 (ABC | DEF)">3 - 3 (ABC | DEF)</option>
                      <option value="2 - 3 - 2 (AB | DEF | GH)">2 - 3 - 2 (AB | DEF | GH)</option>
                    </select>
                  </div>
                  <button 
                    onClick={handleAddCabin}
                    style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #dadce0', background: '#fff', fontWeight: 'bold', fontSize: '13px', cursor: 'pointer', color: '#3c4043' }}
                  >
                    + Add cabin
                  </button>
                  <p style={{ fontSize: '11px', color: '#5f6368', marginTop: '6px' }}>Enter a class name and both row numbers to add this cabin.</p>
                </div>
              </div>

              <div style={{ backgroundColor: '#fef7e0', border: '1px solid #fce8b2', padding: '12px', borderRadius: '6px', fontSize: '12px', color: '#b06000', lineHeight: '1.4' }}>
                Once saved, this layout is permanent. To change it later, clone the type. Double-check row ranges, row types and blocked seats first.
              </div>

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button 
                  onClick={() => setIsEditorMode(false)}
                  style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #dadce0', background: '#fff', cursor: 'pointer', fontSize: '13px' }}
                >
                  Cancel
                </button>
                <button 
                  onClick={handleSaveAircraftType}
                  style={{ padding: '8px 20px', borderRadius: '6px', border: 'none', background: '#1a56db', color: '#fff', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px' }}
                >
                  Save aircraft type
                </button>
              </div>
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '8px', border: '1px solid #dadce0' }}>
                <div style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '12px' }}>Capacity summary</div>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <div style={{ flex: 1, backgroundColor: '#f8f9fa', padding: '12px', borderRadius: '6px' }}>
                    <div style={{ fontSize: '10px', color: '#5f6368', fontWeight: 'bold' }}>TOTAL SEATS</div>
                    <div style={{ fontSize: '20px', fontWeight: 'bold', marginTop: '4px' }}>{totalSeats}</div>
                  </div>
                  <div style={{ flex: 1, backgroundColor: '#f8f9fa', padding: '12px', borderRadius: '6px' }}>
                    <div style={{ fontSize: '10px', color: '#c5221f', fontWeight: 'bold' }}>BLOCKED</div>
                    <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#c5221f', marginTop: '4px' }}>{blockedCount}</div>
                  </div>
                  <div style={{ flex: 1, backgroundColor: '#f8f9fa', padding: '12px', borderRadius: '6px' }}>
                    <div style={{ fontSize: '10px', color: '#137333', fontWeight: 'bold' }}>SELLABLE</div>
                    <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#137333', marginTop: '4px' }}>{sellableCount}</div>
                  </div>
                </div>
              </div>

              <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '8px', border: '1px solid #dadce0', maxHeight: '620px', overflowY: 'auto' }}>
                <div style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '4px' }}>Seat map preview</div>
                <p style={{ fontSize: '11px', color: '#5f6368', margin: '0 0 16px 0' }}>
                  Click a seat to toggle blocked (blocked seats are not sellable). Click a row number to mark the whole row: exit row, then extra legroom, then normal.
                </p>

                <div style={{ border: '1px solid #e0e0e0', borderRadius: '80px 80px 16px 16px', padding: '40px 20px 20px 20px', backgroundColor: '#fafafa', width: '310px', margin: '0 auto' }}>
                  <div style={{ textAlign: 'center', fontSize: '10px', color: '#9e9e9e', fontWeight: 'bold', letterSpacing: '1px', marginBottom: '20px' }}>FRONT</div>

                  {cabins.map((cabin) => {
                    const rowNumbers = Array.from({ length: cabin.lastRow - cabin.firstRow + 1 }, (_, i) => cabin.firstRow + i);
                    
                    let group1 = ['A', 'B'];
                    let group2 = ['D', 'E', 'F'];
                    let group3 = ['G', 'H'];

                    if (cabin.layoutPattern === '2-2') {
                      group1 = ['A', 'B'];
                      group2 = ['D', 'E'];
                      group3 = [];
                    } else if (cabin.layoutPattern === '3-3') {
                      group1 = ['A', 'B', 'C'];
                      group2 = ['D', 'E', 'F'];
                      group3 = [];
                    } else if (cabin.layoutPattern === '2-3-2') {
                      group1 = ['A', 'B'];
                      group2 = ['D', 'E', 'F'];
                      group3 = ['G', 'H'];
                    }

                    return (
                      <div key={cabin.id} style={{ marginBottom: '24px' }}>
                        <div style={{ textAlign: 'center', fontSize: '11px', fontWeight: 'bold', color: '#5f6368', marginBottom: '12px' }}>
                          {cabin.name.toUpperCase()} · rows {cabin.firstRow}-{cabin.lastRow} · {cabin.layoutPattern}
                        </div>

                        {rowNumbers.map((rowNum) => {
                          return (
                            <div key={rowNum} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', marginBottom: '6px' }}>
                              <div style={{ display: 'flex', gap: '2px' }}>
                                {group1.map((letter) => {
                                  const seatId = `${rowNum}${letter}`;
                                  const isBlocked = blockedSeats.has(seatId);
                                  return (
                                    <button
                                      key={seatId}
                                      onClick={() => handleToggleSeatBlock(seatId)}
                                      style={{
                                        width: '22px',
                                        height: '24px',
                                        borderRadius: '4px',
                                        border: '1px solid #dadce0',
                                        backgroundColor: isBlocked ? '#fce8e6' : '#e8f0fe',
                                        color: isBlocked ? '#c5221f' : '#1a73e8',
                                        fontSize: '10px',
                                        cursor: 'pointer',
                                        padding: 0
                                      }}
                                    >
                                      {letter}
                                    </button>
                                  );
                                })}
                              </div>

                              <span style={{ width: '20px', textAlign: 'center', fontSize: '11px', color: '#137333', fontWeight: 'bold' }}>
                                {rowNum}
                              </span>

                              <div style={{ display: 'flex', gap: '2px' }}>
                                {group2.map((letter) => {
                                  const seatId = `${rowNum}${letter}`;
                                  const isBlocked = blockedSeats.has(seatId);
                                  return (
                                    <button
                                      key={seatId}
                                      onClick={() => handleToggleSeatBlock(seatId)}
                                      style={{
                                        width: '22px',
                                        height: '24px',
                                        borderRadius: '4px',
                                        border: '1px solid #dadce0',
                                        backgroundColor: isBlocked ? '#fce8e6' : '#e8f0fe',
                                        color: isBlocked ? '#c5221f' : '#1a73e8',
                                        fontSize: '10px',
                                        cursor: 'pointer',
                                        padding: 0
                                      }}
                                    >
                                      {letter}
                                    </button>
                                  );
                                })}
                              </div>

                              {group3.length > 0 && (
                                <>
                                  <span style={{ width: '20px', textAlign: 'center', fontSize: '11px', color: '#137333', fontWeight: 'bold' }}>
                                    {rowNum}
                                  </span>

                                  <div style={{ display: 'flex', gap: '2px' }}>
                                    {group3.map((letter) => {
                                      const seatId = `${rowNum}${letter}`;
                                      const isBlocked = blockedSeats.has(seatId);
                                      return (
                                        <button
                                          key={seatId}
                                          onClick={() => handleToggleSeatBlock(seatId)}
                                          style={{
                                            width: '22px',
                                            height: '24px',
                                            borderRadius: '4px',
                                            border: '1px solid #dadce0',
                                            backgroundColor: isBlocked ? '#fce8e6' : '#e8f0fe',
                                            color: isBlocked ? '#c5221f' : '#1a73e8',
                                            fontSize: '10px',
                                            cursor: 'pointer',
                                            padding: 0
                                          }}
                                        >
                                          {letter}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
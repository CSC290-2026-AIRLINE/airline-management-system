import React, { useState } from 'react';
import { Link } from '@tanstack/react-router';

type TaskStatus = 'pending' | 'in progress' | 'completed' | 'skipped';

interface TurnaroundTask {
  id: string;
  name: string;
  status: TaskStatus;
}

interface TurnaroundItem {
  id: string;
  registrationNumber: string;
  landedInfo: string;
  tasks: TurnaroundTask[];
}

export const ReadinessPage: React.FC = () => {
  // --- Fleet Reserve Check State ---
  const [selectedDate, setSelectedDate] = useState('2026-10-12');
  const [aircraftNeeded, setAircraftNeeded] = useState(100);
  const reserveRatio = 1.10;
  const readyNow = 104;

  const targetReady = Math.ceil(aircraftNeeded * reserveRatio);
  const shortfall = Math.max(0, targetReady - readyNow);

  // --- Turnarounds Mock Data ---
  const [turnarounds, setTurnarounds] = useState<TurnaroundItem[]>([
    {
      id: '1',
      registrationNumber: 'HS-ABA',
      landedInfo: 'landed CNX · 09:40',
      tasks: [
        { id: 't1', name: 'Refuel', status: 'completed' },
        { id: 't2', name: 'Cleaning', status: 'in progress' },
        { id: 't3', name: 'Catering', status: 'pending' },
        { id: 't4', name: 'Inspection', status: 'pending' },
      ],
    },
    {
      id: '2',
      registrationNumber: 'HS-ABB',
      landedInfo: 'landed BKK · 08:15',
      tasks: [
        { id: 't1', name: 'Refuel', status: 'completed' },
        { id: 't2', name: 'Cleaning', status: 'completed' },
        { id: 't3', name: 'Catering', status: 'completed' },
        { id: 't4', name: 'Inspection', status: 'completed' },
      ],
    },
    {
      id: '3',
      registrationNumber: 'HS-ABC',
      landedInfo: 'landed DMK · 10:05',
      tasks: [
        { id: 't1', name: 'Refuel', status: 'pending' },
        { id: 't2', name: 'Cleaning', status: 'pending' },
        { id: 't3', name: 'Catering', status: 'pending' },
        { id: 't4', name: 'Inspection', status: 'pending' },
      ],
    },
  ]);

  // Click task to cycle through: pending -> in progress -> completed -> skipped -> pending
  const handleCycleTaskStatus = (itemId: string, taskId: string) => {
    setTurnarounds((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;

        const updatedTasks = item.tasks.map((task) => {
          if (task.id !== taskId) return task;
          const statusOrder: TaskStatus[] = ['pending', 'in progress', 'completed', 'skipped'];
          const currentIndex = statusOrder.indexOf(task.status);
          const nextStatus = statusOrder[(currentIndex + 1) % statusOrder.length];
          return { ...task, status: nextStatus };
        });

        return { ...item, tasks: updatedTasks };
      })
    );
  };

  // Task button styling helper
  const getTaskStyle = (status: TaskStatus) => {
    switch (status) {
      case 'completed':
        return {
          backgroundColor: '#e6f4ea',
          color: '#137333',
          border: '1px solid #ceead6',
        };
      case 'in progress':
        return {
          backgroundColor: '#e8f0fe',
          color: '#1a73e8',
          border: '1px solid #aecbfa',
        };
      case 'skipped':
        return {
          backgroundColor: '#f1f3f4',
          color: '#5f6368',
          border: '1px solid #dadce0',
          textDecoration: 'line-through',
        };
      case 'pending':
      default:
        return {
          backgroundColor: '#ffffff',
          color: '#3c4043',
          border: '1px solid #dadce0',
        };
    }
  };

  return (
    <div style={{ padding: '24px', backgroundColor: '#f4f5f7', minHeight: '100vh', fontFamily: 'sans-serif', color: '#333' }}>
      {/* Top Navbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', backgroundColor: '#fff', padding: '12px 24px', borderRadius: '8px', border: '1px solid #e0e0e0' }}>
        <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold' }}>Flython Ops</h2>
          <Link to="/aircraft" style={{ color: '#5f6368', fontSize: '14px', textDecoration: 'none' }}>
            Fleet
          </Link>
          <Link to="/aircraft-types" style={{ color: '#5f6368', fontSize: '14px', textDecoration: 'none' }}>
            Aircraft Types
          </Link>
          <Link to="/readiness" style={{ backgroundColor: '#e8f0fe', color: '#1a73e8', padding: '6px 12px', borderRadius: '6px', fontWeight: 'bold', fontSize: '14px', textDecoration: 'none' }}>
            Readiness
          </Link>
        </div>
        <div style={{ fontSize: '13px', color: '#5f6368' }}>Staff · admin</div>
      </div>

      {/* Main Layout Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '24px', alignItems: 'start' }}>
        
        {/* Left Column: Fleet reserve check */}
        <div style={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #dadce0', padding: '20px' }}>
          <h3 style={{ margin: '0 0 6px 0', fontSize: '16px', fontWeight: 'bold' }}>Fleet reserve check</h3>
          <p style={{ margin: '0 0 20px 0', fontSize: '12px', color: '#5f6368', lineHeight: '1.4' }}>
            Target ready aircraft = aircraft needed that day × reserve ratio, rounded up.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11px', color: '#5f6368', marginBottom: '4px' }}>Date</label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #dadce0', fontSize: '13px', boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11px', color: '#5f6368', marginBottom: '4px' }}>Aircraft needed</label>
              <input
                type="number"
                value={aircraftNeeded}
                onChange={(e) => setAircraftNeeded(Number(e.target.value))}
                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #dadce0', fontSize: '13px', boxSizing: 'border-box' }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div style={{ backgroundColor: '#f8f9fa', padding: '12px', borderRadius: '6px' }}>
              <div style={{ fontSize: '10px', color: '#5f6368', fontWeight: 'bold' }}>RESERVE RATIO</div>
              <div style={{ fontSize: '20px', fontWeight: 'bold', marginTop: '4px' }}>{reserveRatio.toFixed(2)}</div>
            </div>
            <div style={{ backgroundColor: '#f8f9fa', padding: '12px', borderRadius: '6px' }}>
              <div style={{ fontSize: '10px', color: '#5f6368', fontWeight: 'bold' }}>TARGET READY</div>
              <div style={{ fontSize: '20px', fontWeight: 'bold', marginTop: '4px' }}>{targetReady}</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
            <div style={{ backgroundColor: '#f8f9fa', padding: '12px', borderRadius: '6px' }}>
              <div style={{ fontSize: '10px', color: '#5f6368', fontWeight: 'bold' }}>READY NOW</div>
              <div style={{ fontSize: '20px', fontWeight: 'bold', marginTop: '4px' }}>{readyNow}</div>
            </div>
            <div style={{ backgroundColor: '#fce8e6', padding: '12px', borderRadius: '6px' }}>
              <div style={{ fontSize: '10px', color: '#c5221f', fontWeight: 'bold' }}>SHORTFALL</div>
              <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#c5221f', marginTop: '4px' }}>{shortfall}</div>
            </div>
          </div>

          {/* Shortfall Indicator Bar */}
          <div style={{ width: '100%', height: '8px', backgroundColor: '#f1f3f4', borderRadius: '4px', overflow: 'hidden', marginBottom: '16px' }}>
            <div style={{ width: `${Math.min(100, (shortfall / targetReady) * 100 * 5)}%`, height: '100%', backgroundColor: '#c5221f' }}></div>
          </div>

          <p style={{ margin: '0 0 12px 0', fontSize: '12px', color: '#c5221f', lineHeight: '1.4' }}>
            Short by {shortfall} ready aircraft. Move maintenance to another day or free up reserve.
          </p>

          <p style={{ margin: 0, fontSize: '11px', color: '#70757a', lineHeight: '1.4' }}>
            Ready = in the fleet, in service all day, operating that weekday, not in maintenance.
          </p>
        </div>

        {/* Right Column: Turnarounds */}
        <div>
          <div style={{ marginBottom: '16px' }}>
            <h3 style={{ margin: '0 0 4px 0', fontSize: '16px', fontWeight: 'bold' }}>Turnarounds</h3>
            <p style={{ margin: 0, fontSize: '12px', color: '#5f6368', lineHeight: '1.4' }}>
              Started by the simulation clock when a flight lands. Click a task to cycle pending, in progress, completed, skipped. Ready when every task is completed or skipped.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {turnarounds.map((item) => {
              const isAllReady = item.tasks.every((t) => t.status === 'completed' || t.status === 'skipped');

              return (
                <div key={item.id} style={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #dadce0', padding: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <div>
                      <span style={{ fontWeight: 'bold', fontSize: '14px', marginRight: '8px' }}>{item.registrationNumber}</span>
                      <span style={{ fontSize: '12px', color: '#5f6368' }}>{item.landedInfo}</span>
                    </div>

                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 'bold',
                        padding: '4px 10px',
                        borderRadius: '12px',
                        backgroundColor: isAllReady ? '#e6f4ea' : '#fef7e0',
                        color: isAllReady ? '#137333' : '#b06000',
                      }}
                    >
                      {isAllReady ? 'Ready' : 'Not ready'}
                    </span>
                  </div>

                  {/* Tasks List */}
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {item.tasks.map((task) => {
                      const style = getTaskStyle(task.status);
                      return (
                        <button
                          key={task.id}
                          onClick={() => handleCycleTaskStatus(item.id, task.id)}
                          style={{
                            padding: '6px 12px',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: '500',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                            ...style,
                          }}
                        >
                          {task.name} · {task.status}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
};
import React, { useState, useEffect } from 'react';
import { Link } from '@tanstack/react-router';
import {
  readinessService,
  type TurnaroundItem,
  type TaskStatus,
} from '../services/readinessService';

export const ReadinessPage: React.FC = () => {
  // --- Fleet Reserve Check State ---
  // Read saved date from localStorage or default to 2026-10-27 so BKF is in service
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return localStorage.getItem('readiness_selected_date') || '2026-10-27';
  });
  const [aircraftNeeded, setAircraftNeeded] = useState(100);
  const [reserveRatio, setReserveRatio] = useState(1.1);
  const [readyNow, setReadyNow] = useState(1);
  const [targetReady, setTargetReady] = useState(111);
  const [shortfall, setShortfall] = useState(110);

  // --- Turnarounds Data ---
  const [turnarounds, setTurnarounds] = useState<TurnaroundItem[]>([]);
  const [isLoadingTurnarounds, setIsLoadingTurnarounds] = useState(true);

  const handleDateChange = (newDate: string) => {
    setSelectedDate(newDate);
    localStorage.setItem('readiness_selected_date', newDate);
  };

  // Load real fleet reserve from backend API whenever date or aircraft needed changes
  useEffect(() => {
    let cancelled = false;

    async function fetchReserve() {
      try {
        const data = await readinessService.getFleetReserve(selectedDate, aircraftNeeded);
        if (!cancelled) {
          setReserveRatio(data.reserveRatio);
          setTargetReady(data.targetReady);
          setReadyNow(data.readyNow);
          setShortfall(data.shortfall);
        }
      } catch (err) {
        console.warn('Could not load fleet reserve from backend:', err);
      }
    }

    void fetchReserve();

    return () => {
      cancelled = true;
    };
  }, [selectedDate, aircraftNeeded]);

  // Load turnarounds from backend API
  useEffect(() => {
    let cancelled = false;

    async function fetchTurnarounds() {
      setIsLoadingTurnarounds(true);
      try {
        const data = await readinessService.getTurnarounds(selectedDate);
        if (!cancelled) {
          setTurnarounds(data);
        }
      } catch (err) {
        console.warn('Could not load turnarounds from backend:', err);
      } finally {
        if (!cancelled) {
          setIsLoadingTurnarounds(false);
        }
      }
    }

    void fetchTurnarounds();

    return () => {
      cancelled = true;
    };
  }, [selectedDate]);

  // Click task to cycle through: pending -> in progress -> completed -> skipped -> pending
  const handleCycleTaskStatus = async (itemId: string, taskId: string) => {
    const item = turnarounds.find((it) => it.id === itemId);
    const task = item?.tasks.find((t) => t.id === taskId);
    if (!task) return;

    const statusOrder: TaskStatus[] = ['pending', 'in progress', 'completed', 'skipped'];
    const currentIndex = statusOrder.indexOf(task.status);
    const nextStatus = statusOrder[(currentIndex + 1) % statusOrder.length];

    // If item has a real turnaroundId from backend, update it
    if (item?.turnaroundId) {
      try {
        await readinessService.updateTurnaroundTaskStatus(item.turnaroundId, taskId, nextStatus);
      } catch (err) {
        console.error('Failed to update task on backend:', err);
      }
    }

    setTurnarounds((prev) =>
      prev.map((it) => {
        if (it.id !== itemId) return it;
        const updatedTasks = it.tasks.map((t) => (t.id === taskId ? { ...t, status: nextStatus } : t));
        return { ...it, tasks: updatedTasks };
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
          marginBottom: '24px',
          backgroundColor: '#fff',
          padding: '12px 24px',
          borderRadius: '8px',
          border: '1px solid #e0e0e0',
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
            style={{ color: '#5f6368', fontSize: '14px', textDecoration: 'none' }}
          >
            Aircraft Types
          </Link>
          <Link
            to="/readiness"
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
            Readiness
          </Link>
        </div>
        <div style={{ fontSize: '13px', color: '#5f6368' }}>Staff · admin</div>
      </div>

      {/* Main Layout Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '320px 1fr',
          gap: '24px',
          alignItems: 'start',
        }}
      >
        {/* Left Column: Fleet reserve check */}
        <div
          style={{
            backgroundColor: '#fff',
            borderRadius: '8px',
            border: '1px solid #dadce0',
            padding: '20px',
          }}
        >
          <h3 style={{ margin: '0 0 6px 0', fontSize: '16px', fontWeight: 'bold' }}>
            Fleet reserve check
          </h3>
          <p
            style={{
              margin: '0 0 20px 0',
              fontSize: '12px',
              color: '#5f6368',
              lineHeight: '1.4',
            }}
          >
            Target ready aircraft = aircraft needed that day × reserve ratio, rounded up.
          </p>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '12px',
              marginBottom: '16px',
            }}
          >
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '11px',
                  color: '#5f6368',
                  marginBottom: '4px',
                }}
              >
                Date
              </label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => handleDateChange(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px',
                  borderRadius: '6px',
                  border: '1px solid #dadce0',
                  fontSize: '13px',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '11px',
                  color: '#5f6368',
                  marginBottom: '4px',
                }}
              >
                Aircraft needed
              </label>
              <input
                type="number"
                value={aircraftNeeded}
                onChange={(e) => setAircraftNeeded(Number(e.target.value))}
                style={{
                  width: '100%',
                  padding: '8px',
                  borderRadius: '6px',
                  border: '1px solid #dadce0',
                  fontSize: '13px',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '12px',
              marginBottom: '12px',
            }}
          >
            <div style={{ backgroundColor: '#f8f9fa', padding: '12px', borderRadius: '6px' }}>
              <div style={{ fontSize: '10px', color: '#5f6368', fontWeight: 'bold' }}>
                RESERVE RATIO
              </div>
              <div style={{ fontSize: '20px', fontWeight: 'bold', marginTop: '4px' }}>
                {reserveRatio.toFixed(2)}
              </div>
            </div>
            <div style={{ backgroundColor: '#f8f9fa', padding: '12px', borderRadius: '6px' }}>
              <div style={{ fontSize: '10px', color: '#5f6368', fontWeight: 'bold' }}>
                TARGET READY
              </div>
              <div style={{ fontSize: '20px', fontWeight: 'bold', marginTop: '4px' }}>
                {targetReady}
              </div>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '12px',
              marginBottom: '16px',
            }}
          >
            <div style={{ backgroundColor: '#f8f9fa', padding: '12px', borderRadius: '6px' }}>
              <div style={{ fontSize: '10px', color: '#5f6368', fontWeight: 'bold' }}>READY NOW</div>
              <div style={{ fontSize: '20px', fontWeight: 'bold', marginTop: '4px' }}>
                {readyNow}
              </div>
            </div>
            <div
              style={{
                backgroundColor: shortfall > 0 ? '#fce8e6' : '#e6f4ea',
                padding: '12px',
                borderRadius: '6px',
              }}
            >
              <div
                style={{
                  fontSize: '10px',
                  color: shortfall > 0 ? '#c5221f' : '#137333',
                  fontWeight: 'bold',
                }}
              >
                SHORTFALL
              </div>
              <div
                style={{
                  fontSize: '20px',
                  fontWeight: 'bold',
                  color: shortfall > 0 ? '#c5221f' : '#137333',
                  marginTop: '4px',
                }}
              >
                {shortfall}
              </div>
            </div>
          </div>

          {/* Shortfall Indicator Bar */}
          <div
            style={{
              width: '100%',
              height: '8px',
              backgroundColor: '#f1f3f4',
              borderRadius: '4px',
              overflow: 'hidden',
              marginBottom: '16px',
            }}
          >
            <div
              style={{
                width: `${Math.min(100, (shortfall / (targetReady || 1)) * 100 * 5)}%`,
                height: '100%',
                backgroundColor: shortfall > 0 ? '#c5221f' : '#137333',
              }}
            ></div>
          </div>

          <p
            style={{
              margin: '0 0 12px 0',
              fontSize: '12px',
              color: shortfall > 0 ? '#c5221f' : '#137333',
              lineHeight: '1.4',
            }}
          >
            {shortfall > 0
              ? `Short by ${shortfall} ready aircraft. Move maintenance to another day or free up reserve.`
              : 'Fleet reserve is satisfied. Enough aircraft are ready.'}
          </p>

          <p style={{ margin: 0, fontSize: '11px', color: '#70757a', lineHeight: '1.4' }}>
            Ready = in the fleet, in service all day, operating that weekday, not in maintenance.
          </p>
        </div>

        {/* Right Column: Turnarounds */}
        <div>
          <div style={{ marginBottom: '16px' }}>
            <h3 style={{ margin: '0 0 4px 0', fontSize: '16px', fontWeight: 'bold' }}>
              Turnarounds
            </h3>
            <p style={{ margin: 0, fontSize: '12px', color: '#5f6368', lineHeight: '1.4' }}>
              Started by the simulation clock when a flight lands. Click a task to cycle pending, in
              progress, completed, skipped. Ready when every task is completed or skipped.
            </p>
          </div>

          {isLoadingTurnarounds ? (
            <div
              style={{
                padding: '24px',
                backgroundColor: '#fff',
                borderRadius: '8px',
                border: '1px solid #dadce0',
                textAlign: 'center',
                color: '#5f6368',
              }}
            >
              Loading turnarounds...
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {turnarounds.map((item) => {
                const isAllReady = item.tasks.every(
                  (t) => t.status === 'completed' || t.status === 'skipped'
                );

                return (
                  <div
                    key={item.id}
                    style={{
                      backgroundColor: '#fff',
                      borderRadius: '8px',
                      border: '1px solid #dadce0',
                      padding: '16px',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '12px',
                      }}
                    >
                      <div>
                        <span style={{ fontWeight: 'bold', fontSize: '14px', marginRight: '8px' }}>
                          {item.registrationNumber}
                        </span>
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
                            onClick={() => void handleCycleTaskStatus(item.id, task.id)}
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
          )}
        </div>
      </div>
    </div>
  );
};

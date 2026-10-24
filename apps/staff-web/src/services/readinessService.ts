const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8080';

export type TaskStatus = 'pending' | 'in progress' | 'completed' | 'skipped';

export interface TurnaroundTask {
  id: string;
  name: string;
  status: TaskStatus;
}

export interface TurnaroundItem {
  id: string;
  turnaroundId?: string;
  registrationNumber: string;
  landedInfo: string;
  tasks: TurnaroundTask[];
}

export interface FleetReserveData {
  date: string;
  aircraftNeeded: number;
  reserveRatio: number;
  targetReady: number;
  readyNow: number;
  shortfall: number;
}

interface BackendTurnaroundTask {
  id: string;
  task_type: string;
  status: string;
}

interface BackendTurnaroundResponse {
  id: string;
  airport_code?: string;
  arrived_at?: string;
  tasks?: BackendTurnaroundTask[];
}

export const readinessService = {
  getFleetReserve: async (date: string, aircraftNeeded: number): Promise<FleetReserveData> => {
    const res = await fetch(`${API_URL}/api/fleet/reserve?date=${date}&aircraft_needed=${aircraftNeeded}`);
    if (!res.ok) {
      throw new Error(`Failed to fetch fleet reserve: ${res.statusText}`);
    }
    const data = (await res.json()) as {
      date: string;
      aircraft_needed: number;
      reserve_ratio: number;
      target: number;
      ready: number;
      shortfall: number;
    };

    return {
      date: data.date,
      aircraftNeeded: data.aircraft_needed,
      reserveRatio: data.reserve_ratio,
      targetReady: data.target,
      readyNow: data.ready,
      shortfall: data.shortfall,
    };
  },

  getTurnarounds: async (selectedDate?: string): Promise<TurnaroundItem[]> => {
    // 1. Fetch all aircraft from backend
    const aircraftRes = await fetch(`${API_URL}/api/aircraft`);
    if (!aircraftRes.ok) {
      throw new Error(`Failed to fetch aircraft: ${aircraftRes.statusText}`);
    }
    let aircraftList = (await aircraftRes.json()) as Array<{
      id: string;
      tail_number?: string;
      base_airport_code?: string;
      entry_into_service_date?: string;
      retired_on?: string | null;
    }>;

    // Filter aircraft that are in service on the selected date
    if (selectedDate) {
      const checkDateStr = selectedDate.slice(0, 10);
      aircraftList = aircraftList.filter((a) => {
        if (a.entry_into_service_date) {
          const entryDateStr =
            typeof a.entry_into_service_date === 'string'
              ? a.entry_into_service_date.slice(0, 10)
              : new Date(a.entry_into_service_date).toISOString().slice(0, 10);
          if (entryDateStr > checkDateStr) return false;
        }
        if (a.retired_on) {
          const retiredDateStr =
            typeof a.retired_on === 'string'
              ? a.retired_on.slice(0, 10)
              : new Date(a.retired_on).toISOString().slice(0, 10);
          if (retiredDateStr < checkDateStr) return false;
        }
        return true;
      });
    }

    // 2. Fetch turnaround for each aircraft in service, or show as standby if none in DB yet
    const items: TurnaroundItem[] = [];

    await Promise.all(
      aircraftList.map(async (a) => {
        try {
          const tRes = await fetch(`${API_URL}/api/aircraft/${a.id}/turnarounds/latest`);
          if (tRes.ok) {
            const tData = (await tRes.json()) as BackendTurnaroundResponse;
            if (tData && tData.tasks && tData.tasks.length > 0) {
              const taskNames: Record<string, string> = {
                refuel: 'Refuel',
                cleaning: 'Cleaning',
                catering: 'Catering',
                inspection: 'Inspection',
              };

              const tasks: TurnaroundTask[] = tData.tasks.map((t) => {
                let status: TaskStatus = 'pending';
                if (t.status === 'in_progress') status = 'in progress';
                else if (t.status === 'completed') status = 'completed';
                else if (t.status === 'skipped') status = 'skipped';

                return {
                  id: t.id,
                  name: taskNames[t.task_type] || t.task_type || 'Task',
                  status,
                };
              });

              items.push({
                id: a.id,
                turnaroundId: tData.id,
                registrationNumber: a.tail_number || 'Unknown',
                landedInfo: `landed ${tData.airport_code || a.base_airport_code || 'BKK'} · ${
                  tData.arrived_at
                    ? new Date(tData.arrived_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : 'Recent'
                }`,
                tasks,
              });
              return;
            }
          }
        } catch {
          // ignore individual fetch failure
        }

        // If no turnaround record exists yet in DB (e.g. newly registered aircraft on standby)
        items.push({
          id: a.id,
          registrationNumber: a.tail_number || 'Unknown',
          landedInfo: `at base ${a.base_airport_code || 'BKK'} · Standby`,
          tasks: [
            { id: `t1-${a.id}`, name: 'Refuel', status: 'pending' },
            { id: `t2-${a.id}`, name: 'Cleaning', status: 'pending' },
            { id: `t3-${a.id}`, name: 'Catering', status: 'pending' },
            { id: `t4-${a.id}`, name: 'Inspection', status: 'pending' },
          ],
        });
      })
    );

    // Sort alphabetically by registrationNumber for clean display
    items.sort((x, y) => x.registrationNumber.localeCompare(y.registrationNumber));

    return items;
  },

  updateTurnaroundTaskStatus: async (
    turnaroundId: string,
    taskId: string,
    status: TaskStatus
  ): Promise<void> => {
    const backendStatus = status === 'in progress' ? 'in_progress' : status;
    const res = await fetch(`${API_URL}/api/turnarounds/${turnaroundId}/tasks/${taskId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: backendStatus }),
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { message?: string };
      throw new Error(err.message || `Failed to update task status: ${res.statusText}`);
    }
  },
};

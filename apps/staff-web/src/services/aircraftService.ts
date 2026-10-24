import type { Aircraft, CreateAircraftInput, AircraftStatus } from '../types/aircraft';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8080';

const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface BackendAircraft {
  id: string;
  tail_number?: string;
  tailNumber?: string;
  aircraft_type_id?: string;
  entry_into_service_date?: string;
  entryIntoService?: string;
  retired_on?: string | null;
  retiredOn?: string | null;
  base_airport_code?: string;
  base?: string;
  current_status?:
    | string
    | {
        status?: string;
        reason?: string | null;
        start_date?: string | null;
        end_date?: string | null;
      };
  aircraft_type?: {
    code?: string;
    model?: string;
    layout?: { cabins?: Array<{ first_row: number; last_row: number; columns: string[] }> };
  };
  model?: string;
  capacity?: number;
}

interface BackendAircraftType {
  code?: string;
  layout?: { cabins?: Array<{ first_row: number; last_row: number; columns: string[] }> };
}

function computeSeatsFromLayout(layout?: { cabins?: Array<{ first_row: number; last_row: number; columns: string[] }> }): number {
  if (!layout?.cabins || !Array.isArray(layout.cabins)) return 180;
  const count = layout.cabins.reduce((acc, c) => acc + (c.last_row - c.first_row + 1) * (c.columns?.length || 0), 0);
  return count > 0 ? count : 180;
}

function mapBackendToAircraft(item: BackendAircraft): Aircraft {
  let status: AircraftStatus = 'In service';
  const statusStr =
    typeof item.current_status === 'object' && item.current_status !== null
      ? item.current_status.status || ''
      : typeof item.current_status === 'string'
        ? item.current_status
        : '';
  const rawStatus = statusStr.toLowerCase();

  if (rawStatus === 'in_maintenance' || rawStatus === 'in maintenance') {
    status = 'In maintenance';
  } else if (rawStatus === 'grounded') {
    status = 'Grounded';
  }

  const statusReason =
    typeof item.current_status === 'object' && item.current_status !== null
      ? item.current_status.reason || undefined
      : undefined;

  const statusStartDate =
    typeof item.current_status === 'object' && item.current_status?.start_date
      ? new Date(item.current_status.start_date).toISOString().split('T')[0]
      : undefined;

  const statusEndDate =
    typeof item.current_status === 'object' && item.current_status?.end_date
      ? new Date(item.current_status.end_date).toISOString().split('T')[0]
      : undefined;

  const entryDate = item.entry_into_service_date
    ? new Date(item.entry_into_service_date).toISOString().split('T')[0]
    : item.entryIntoService || '2020-01-01';

  const retiredOn = item.retired_on
    ? new Date(item.retired_on).toISOString().split('T')[0]
    : item.retiredOn || null;

  return {
    id: item.id,
    tailNumber: item.tail_number || item.tailNumber || '',
    model: item.aircraft_type?.model || item.aircraft_type?.code || item.model || 'Unknown',
    base: item.base_airport_code || item.base || 'BKK',
    capacity: computeSeatsFromLayout(item.aircraft_type?.layout) || item.capacity || 180,
    status,
    statusReason,
    statusStartDate,
    statusEndDate,
    retiredOn,
    entryIntoService: entryDate,
  };
}

export const aircraftService = {
  getAll: async (): Promise<Aircraft[]> => {
    const res = await fetch(`${API_URL}/api/aircraft`);
    if (!res.ok) {
      throw new Error(`Failed to fetch aircrafts: ${res.statusText}`);
    }
    const data = (await res.json()) as BackendAircraft[];
    return Array.isArray(data) ? data.map(mapBackendToAircraft) : [];
  },

  getById: async (id: string): Promise<Aircraft> => {
    const res = await fetch(`${API_URL}/api/aircraft/${id}`);
    if (!res.ok) {
      throw new Error(`Failed to fetch aircraft ${id}: ${res.statusText}`);
    }
    const data = (await res.json()) as BackendAircraft;
    return mapBackendToAircraft(data);
  },

  create: async (input: CreateAircraftInput): Promise<Aircraft> => {
    const payload = {
      tail_number: input.tailNumber.trim().toUpperCase(),
      model: input.model,
      base_airport_code: input.base.trim().toUpperCase(),
      entry_into_service_date: input.entryDate || new Date().toISOString().split('T')[0],
    };

    const res = await fetch(`${API_URL}/api/aircraft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { message?: string };
      throw new Error(err.message || `Failed to create aircraft: ${res.statusText}`);
    }

    const data = (await res.json()) as BackendAircraft;
    return mapBackendToAircraft(data);
  },

  update: async (
    id: string,
    data: { tail_number?: string; base_airport_code?: string; retired_on?: string | null }
  ): Promise<Aircraft> => {
    const res = await fetch(`${API_URL}/api/aircraft/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { message?: string };
      throw new Error(err.message || `Failed to update aircraft: ${res.statusText}`);
    }

    const result = (await res.json()) as BackendAircraft;
    return mapBackendToAircraft(result);
  },

  setStatus: async (
    id: string,
    params: {
      status: AircraftStatus;
      reason?: string;
      startDate?: string;
      endDate?: string;
    }
  ): Promise<void> => {
    const statusMap: Record<AircraftStatus, string> = {
      'In service': 'in_service',
      'In maintenance': 'in_maintenance',
      Grounded: 'grounded',
    };

    const payload = {
      status: statusMap[params.status] || 'in_service',
      reason: params.reason || null,
      start_date: params.startDate || new Date().toISOString().split('T')[0],
      end_date: params.endDate || null,
    };

    const res = await fetch(`${API_URL}/api/aircraft/${id}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { message?: string };
      throw new Error(err.message || `Failed to set status: ${res.statusText}`);
    }
  },

  scheduleMaintenance: async (
    id: string,
    params: {
      maintenanceType: string;
      startDate: string;
      endDate: string;
      description?: string;
    }
  ): Promise<void> => {
    const payload = {
      maintenance_type: params.maintenanceType,
      planned_start_date: params.startDate,
      planned_end_date: params.endDate,
      description: params.description || '',
    };

    const res = await fetch(`${API_URL}/api/aircraft/${id}/maintenance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { message?: string };
      throw new Error(err.message || `Failed to schedule maintenance: ${res.statusText}`);
    }
  },

  getOperatingDays: async (id: string): Promise<string[]> => {
    try {
      const res = await fetch(`${API_URL}/api/aircraft/${id}/operating-days`);
      if (!res.ok) return DAYS_OF_WEEK;
      const data = (await res.json()) as { days?: number[] };
      if (data && Array.isArray(data.days) && data.days.length > 0) {
        return data.days.map((num) => DAYS_OF_WEEK[num - 1] || 'Mon');
      }
    } catch {
      // Fallback to default
    }
    return DAYS_OF_WEEK;
  },

  setOperatingDays: async (id: string, days: string[]): Promise<string[]> => {
    const dayNumbers = days
      .map((d) => DAYS_OF_WEEK.indexOf(d) + 1)
      .filter((n) => n >= 1 && n <= 7);

    const res = await fetch(`${API_URL}/api/aircraft/${id}/operating-days`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ days: dayNumbers }),
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { message?: string };
      throw new Error(err.message || `Failed to save operating days: ${res.statusText}`);
    }

    return days;
  },

  getAircraftTypes: async (): Promise<{ code: string; capacity: number }[]> => {
    try {
      const res = await fetch(`${API_URL}/api/aircraft-types`);
      if (res.ok) {
        const list = (await res.json()) as BackendAircraftType[];
        if (Array.isArray(list) && list.length > 0) {
          return list.map((item) => ({
            code: item.code || 'Unknown',
            capacity: computeSeatsFromLayout(item.layout) || 180,
          }));
        }
      }
    } catch {
      // Fallback if backend is not reachable
    }

    return [
      { code: 'A320', capacity: 180 },
      { code: 'A321', capacity: 220 },
      { code: 'B738', capacity: 189 },
    ];
  },
};

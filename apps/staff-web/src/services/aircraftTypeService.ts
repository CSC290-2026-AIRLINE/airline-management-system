import type { AircraftType, AircraftTypeLayout } from '../types/aircraftType';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8080';

interface BackendTypeResponse {
  id: string;
  code: string;
  manufacturer: string;
  model: string;
  layout: AircraftTypeLayout;
  hold_weight_limit_kg: number;
  max_takeoff_weight_kg: number;
  max_range_km: number;
  min_turnaround_minutes: number;
  operating_cost_per_hour: number;
  cost_currency: string;
  is_active: boolean;
}

function mapBackendToType(item: BackendTypeResponse): AircraftType {
  return {
    id: item.id,
    code: item.code,
    manufacturer: item.manufacturer,
    model: item.model,
    hold_weight_limit_kg: item.hold_weight_limit_kg,
    max_takeoff_weight_kg: item.max_takeoff_weight_kg,
    max_range_km: item.max_range_km,
    min_turnaround_minutes: item.min_turnaround_minutes,
    operating_cost_per_hour: Number(item.operating_cost_per_hour),
    cost_currency: item.cost_currency,
    is_active: item.is_active ?? true,
    layout: item.layout || { cabins: [] },
  };
}

export const aircraftTypeService = {
  getAll: async (): Promise<AircraftType[]> => {
    const res = await fetch(`${API_URL}/api/aircraft-types`);
    if (!res.ok) {
      throw new Error(`Failed to fetch aircraft types: ${res.statusText}`);
    }
    const data = (await res.json()) as BackendTypeResponse[];
    return Array.isArray(data) ? data.map(mapBackendToType) : [];
  },

  getById: async (id: string): Promise<AircraftType> => {
    const res = await fetch(`${API_URL}/api/aircraft-types/${id}`);
    if (!res.ok) {
      throw new Error(`Failed to fetch aircraft type ${id}: ${res.statusText}`);
    }
    const data = (await res.json()) as BackendTypeResponse;
    return mapBackendToType(data);
  },

  create: async (data: Omit<AircraftType, 'id'>): Promise<AircraftType> => {
    // Only send the exact schema fields that Prisma accepts (no total_seats):
    const payload = {
      code: data.code.trim().toUpperCase(),
      manufacturer: data.manufacturer.trim(),
      model: data.model.trim(),
      layout: data.layout,
      hold_weight_limit_kg: Math.round(Number(data.hold_weight_limit_kg)),
      max_takeoff_weight_kg: Math.round(Number(data.max_takeoff_weight_kg)),
      max_range_km: Math.round(Number(data.max_range_km)),
      min_turnaround_minutes: Math.round(Number(data.min_turnaround_minutes)),
      operating_cost_per_hour: Number(data.operating_cost_per_hour),
      cost_currency: data.cost_currency || 'USD',
      is_active: data.is_active ?? true,
    };

    const res = await fetch(`${API_URL}/api/aircraft-types`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { message?: string | string[] };
      const message = Array.isArray(err.message) ? err.message.join(', ') : err.message;
      throw new Error(message || `Failed to create aircraft type: ${res.statusText}`);
    }

    const created = (await res.json()) as BackendTypeResponse;
    return mapBackendToType(created);
  },

  update: async (id: string, data: Partial<AircraftType>): Promise<AircraftType> => {
    const updatePayload: Record<string, unknown> = {};
    if (data.code !== undefined) updatePayload.code = data.code.trim().toUpperCase();
    if (data.manufacturer !== undefined) updatePayload.manufacturer = data.manufacturer.trim();
    if (data.model !== undefined) updatePayload.model = data.model.trim();
    if (data.hold_weight_limit_kg !== undefined) updatePayload.hold_weight_limit_kg = Math.round(Number(data.hold_weight_limit_kg));
    if (data.max_takeoff_weight_kg !== undefined) updatePayload.max_takeoff_weight_kg = Math.round(Number(data.max_takeoff_weight_kg));
    if (data.max_range_km !== undefined) updatePayload.max_range_km = Math.round(Number(data.max_range_km));
    if (data.min_turnaround_minutes !== undefined) updatePayload.min_turnaround_minutes = Math.round(Number(data.min_turnaround_minutes));
    if (data.operating_cost_per_hour !== undefined) updatePayload.operating_cost_per_hour = Number(data.operating_cost_per_hour);
    if (data.cost_currency !== undefined) updatePayload.cost_currency = data.cost_currency;
    if (data.is_active !== undefined) updatePayload.is_active = data.is_active;

    const res = await fetch(`${API_URL}/api/aircraft-types/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatePayload),
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { message?: string | string[] };
      const message = Array.isArray(err.message) ? err.message.join(', ') : err.message;
      throw new Error(message || `Failed to update aircraft type: ${res.statusText}`);
    }

    const updated = (await res.json()) as BackendTypeResponse;
    return mapBackendToType(updated);
  },

  clone: async (id: string, code: string, layout?: AircraftTypeLayout): Promise<AircraftType> => {
    const res = await fetch(`${API_URL}/api/aircraft-types/${id}/clone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: code.trim().toUpperCase(), layout }),
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { message?: string | string[] };
      const message = Array.isArray(err.message) ? err.message.join(', ') : err.message;
      throw new Error(message || `Failed to clone aircraft type: ${res.statusText}`);
    }

    const cloned = (await res.json()) as BackendTypeResponse;
    return mapBackendToType(cloned);
  },
};

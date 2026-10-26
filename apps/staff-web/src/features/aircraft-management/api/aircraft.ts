import { requestJson, type Fetcher } from './http'
import type { Aircraft, AircraftStatusSummary, MaintenanceWindow, StatusPeriod } from '../types'

export interface CreateAircraftPayload {
  tail_number: string
  aircraft_type_id: string
  base_airport_code: string
  entry_into_service_date: string
}

export interface UpdateAircraftPayload {
  tail_number?: string
  base_airport_code?: string
  retired_on?: string | null
}

export interface CreateAircraftStatusPayload {
  status: 'in_service' | 'grounded'
  reason?: string
  start_date: string
  end_date?: string | null
}

export interface CreateMaintenancePayload {
  maintenance_type: string
  planned_start_date: string
  planned_end_date: string
}

export const listAircraft = (fetcher: Fetcher): Promise<Aircraft[]> => requestJson<Aircraft[]>(fetcher, '/api/aircraft')

export const getAircraft = (fetcher: Fetcher, id: string): Promise<Aircraft> => requestJson<Aircraft>(fetcher, `/api/aircraft/${id}`)

export const createAircraft = (fetcher: Fetcher, payload: CreateAircraftPayload): Promise<Aircraft> =>
  requestJson<Aircraft>(fetcher, '/api/aircraft', { method: 'POST', body: JSON.stringify(payload) })

export const updateAircraft = (fetcher: Fetcher, id: string, payload: UpdateAircraftPayload): Promise<Aircraft> =>
  requestJson<Aircraft>(fetcher, `/api/aircraft/${id}`, { method: 'PUT', body: JSON.stringify(payload) })

export const getAircraftStatus = (fetcher: Fetcher, id: string): Promise<AircraftStatusSummary> =>
  requestJson<AircraftStatusSummary>(fetcher, `/api/aircraft/${id}/status`)

export const createAircraftStatus = (fetcher: Fetcher, id: string, payload: CreateAircraftStatusPayload): Promise<StatusPeriod> =>
  requestJson<StatusPeriod>(fetcher, `/api/aircraft/${id}/status`, { method: 'POST', body: JSON.stringify(payload) })

export const listStatusHistory = (fetcher: Fetcher, id: string): Promise<StatusPeriod[]> =>
  requestJson<StatusPeriod[]>(fetcher, `/api/aircraft/${id}/status/history`)

export const listMaintenance = (fetcher: Fetcher, id: string): Promise<MaintenanceWindow[]> =>
  requestJson<MaintenanceWindow[]>(fetcher, `/api/aircraft/${id}/maintenance`)

export const createMaintenance = (fetcher: Fetcher, id: string, payload: CreateMaintenancePayload): Promise<MaintenanceWindow> =>
  requestJson<MaintenanceWindow>(fetcher, `/api/aircraft/${id}/maintenance`, { method: 'POST', body: JSON.stringify(payload) })

export const getOperatingDays = (fetcher: Fetcher, id: string): Promise<{ days: number[] }> =>
  requestJson<{ days: number[] }>(fetcher, `/api/aircraft/${id}/operating-days`)

export const setOperatingDays = (fetcher: Fetcher, id: string, days: number[]): Promise<{ days: number[] }> =>
  requestJson<{ days: number[] }>(fetcher, `/api/aircraft/${id}/operating-days`, { method: 'PUT', body: JSON.stringify({ days }) })

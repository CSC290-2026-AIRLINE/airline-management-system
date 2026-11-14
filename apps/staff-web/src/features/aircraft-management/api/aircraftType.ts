import { requestJson, type Fetcher } from './http'
import type { AircraftType, AircraftTypeLayout } from '../types'

export interface CreateAircraftTypePayload {
  code: string
  manufacturer: string
  model: string
  layout: AircraftTypeLayout
  hold_weight_limit_kg: number
  max_takeoff_weight_kg: number
  max_range_km: number
  min_turnaround_minutes: number
  operating_cost_per_hour: number
  cost_currency: string
  is_active: boolean
}

export type UpdateAircraftTypePayload = Partial<Omit<CreateAircraftTypePayload, 'layout'>>

export const listAircraftTypes = (fetcher: Fetcher): Promise<AircraftType[]> => requestJson<AircraftType[]>(fetcher, '/api/aircraft-types')

export const getAircraftType = (fetcher: Fetcher, id: string): Promise<AircraftType> =>
  requestJson<AircraftType>(fetcher, `/api/aircraft-types/${id}`)

export const createAircraftType = (fetcher: Fetcher, payload: CreateAircraftTypePayload): Promise<AircraftType> =>
  requestJson<AircraftType>(fetcher, '/api/aircraft-types', { method: 'POST', body: JSON.stringify(payload) })

export const updateAircraftType = (fetcher: Fetcher, id: string, payload: UpdateAircraftTypePayload): Promise<AircraftType> =>
  requestJson<AircraftType>(fetcher, `/api/aircraft-types/${id}`, { method: 'PUT', body: JSON.stringify(payload) })

export const cloneAircraftType = (fetcher: Fetcher, id: string, code: string, layout?: AircraftTypeLayout): Promise<AircraftType> =>
  requestJson<AircraftType>(fetcher, `/api/aircraft-types/${id}/clone`, { method: 'POST', body: JSON.stringify({ code, layout }) })

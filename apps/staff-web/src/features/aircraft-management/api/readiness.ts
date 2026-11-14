import { requestJson, type Fetcher } from './http'
import type { FleetReserve, FleetSettings, Turnaround, TurnaroundTask, TurnaroundTaskStatus } from '../types'

export const getFleetReserve = (fetcher: Fetcher, date: string, aircraftNeeded: number): Promise<FleetReserve> =>
  requestJson<FleetReserve>(
    fetcher,
    `/api/fleet/reserve?date=${encodeURIComponent(date)}&aircraft_needed=${encodeURIComponent(String(aircraftNeeded))}`,
  )

export const getLatestTurnaround = (fetcher: Fetcher, aircraftId: string): Promise<Turnaround | null> =>
  requestJson<Turnaround | null>(fetcher, `/api/aircraft/${aircraftId}/turnarounds/latest`)

export const updateTurnaroundTask = (
  fetcher: Fetcher,
  turnaroundId: string,
  taskId: string,
  status: TurnaroundTaskStatus,
): Promise<TurnaroundTask> =>
  requestJson<TurnaroundTask>(fetcher, `/api/turnarounds/${turnaroundId}/tasks/${taskId}`, {
    method: 'PUT',
    body: JSON.stringify({ status }),
  })

export const getFleetSettings = (fetcher: Fetcher): Promise<FleetSettings> => requestJson<FleetSettings>(fetcher, '/api/fleet/settings')

export const setReserveRatio = (fetcher: Fetcher, value: number): Promise<FleetSettings> =>
  requestJson<FleetSettings>(fetcher, '/api/fleet/settings/reserve_ratio', { method: 'PUT', body: JSON.stringify({ value }) })

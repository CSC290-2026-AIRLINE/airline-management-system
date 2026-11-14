import { requestJson, type Fetcher } from './http'
import type { FleetReserve, Turnaround, TurnaroundTask, TurnaroundTaskStatus } from '../types'

export const getFleetReserve = (fetcher: Fetcher, date: string, aircraftNeeded: number): Promise<FleetReserve> =>
  requestJson<FleetReserve>(
    fetcher,
    `/api/fleet/reserve?date=${encodeURIComponent(date)}&aircraft_needed=${encodeURIComponent(String(aircraftNeeded))}`,
  )

export const updateReserveRatio = (
  fetcher: Fetcher,
  value: number,
): Promise<{ key: string; value: string; updated_at: string; updated_by: string | null }> =>
  requestJson(fetcher, '/api/fleet/settings/reserve_ratio', {
    method: 'PUT',
    body: JSON.stringify({ value }),
  })

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

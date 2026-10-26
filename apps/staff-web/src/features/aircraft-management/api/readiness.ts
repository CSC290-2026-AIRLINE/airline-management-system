import { requestJson, type Fetcher } from './http'
import type { FleetReserve, Turnaround, TurnaroundTask, TurnaroundTaskStatus } from '../types'

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

export interface StartTurnaroundPayload {
  flight_id: string
  airport_code: string
  arrived_at: string
  tasks?: { task_type: string }[]
}

/** Starts a turnaround by hand, for a flight that the simulation clock did not open one for. */
export const startTurnaround = (fetcher: Fetcher, aircraftId: string, payload: StartTurnaroundPayload): Promise<Turnaround> =>
  requestJson<Turnaround>(fetcher, `/api/aircraft/${aircraftId}/turnarounds`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })

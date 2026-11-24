import type { SimulationClock } from '../common/report.ports'

export class MockSimulationClock implements SimulationClock {
  constructor(private currentTime: Date = new Date()) {}

  now(): Date {
    return new Date(this.currentTime)
  }

  setTime(date: Date): void {
    this.currentTime = new Date(date)
  }
}

import { useEffect } from 'react'
import type { BiFilters } from '../api/bi'
import { defaultFilters } from '../lib-comparison'

/**
 * A view's first load uses the browser's month (defaultFilters), because the simulation clock arrives with `/bi/status`.
 * Once it does, the default dates move to the simulation's month, unless other dates were applied in the meantime. So
 * after the admin console shifts the clock, the default range still has data.
 */
export function useSimulationDefaults(simulationNow: string | undefined, applied: BiFilters, apply: (next: BiFilters) => void): void {
  useEffect(() => {
    if (!simulationNow) return
    const browser = defaultFilters()
    const simulation = defaultFilters(new Date(simulationNow))
    if (applied.from !== browser.from || applied.to !== browser.to) return
    if (simulation.from === browser.from && simulation.to === browser.to) return
    apply({ ...applied, from: simulation.from, to: simulation.to })
    // Only the clock's arrival should move the dates; later filter changes are the user's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simulationNow])
}

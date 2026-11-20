import { createBuildPairingsApi, type FetchWithAuth } from '../build-pairings/types/api'
import type { BuildPairingParams, LocalDate } from '../build-pairings/types/types'

/**
 * The dates of a draft roster run that has pairings in `window`, or null.
 *
 * The wizard pages open on today and tomorrow when the URL carries no dates (from the sidebar), which can catch only part
 * of a run in progress, such as a 20–21 Nov run seen from 21–22 Nov. They use this to open that run on its own dates
 * instead, so every page shows the same run. A failed lookup is null: the page then simply opens on today.
 */
export async function draftRunWindow(
  fetchWithAuth: FetchWithAuth,
  window: BuildPairingParams,
): Promise<{ dateFrom: LocalDate; dateTo: LocalDate } | null> {
  try {
    const list = await createBuildPairingsApi(fetchWithAuth).listPairings(window)
    const row = list.committed.find((item) => item.runStatus === 'draft')
    return row ? { dateFrom: row.runDateFrom, dateTo: row.runDateTo } : null
  } catch {
    return null
  }
}

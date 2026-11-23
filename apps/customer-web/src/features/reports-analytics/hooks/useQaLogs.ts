import { useListReportQaLogs } from '../api/reports'
import { fixtureQaLogs } from '../fixtures'
import type { QaLogEntry, QaLogPage, QaLogQuery } from '../types'
import { usePagedList, type PagedListState } from './usePagedList'

/** How many questions a page of the All Q&A list holds. */
const PAGE_SIZE = 9

/** The All Q&A Logs screen: every question passengers asked, one page of the filtered list at a time. */
export function useQaLogs(query: QaLogQuery): PagedListState<QaLogEntry, QaLogPage> {
  const listReportQaLogs = useListReportQaLogs()
  return usePagedList<QaLogEntry, QaLogPage>({
    queryKey: JSON.stringify(query),
    limit: PAGE_SIZE,
    load: (cursor) => listReportQaLogs({ ...query, cursor, limit: PAGE_SIZE }),
    fallback: (cursor) => fixtureQaLogs(query, cursor, PAGE_SIZE),
  })
}

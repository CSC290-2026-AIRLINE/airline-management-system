import { useListReportSessions } from '../api/reports'
import { fixtureSessionHistory } from '../fixtures'
import type { ReportSession, ReportSessionPage, ReportSessionQuery } from '../types'
import { usePagedList, type PagedListState } from './usePagedList'

/** How many sessions a page of the Session History list holds. */
const PAGE_SIZE = 12

/** The Session History screen: every robot session, newest first, one page of the filtered list at a time. */
export function useSessionHistory(query: ReportSessionQuery): PagedListState<ReportSession, ReportSessionPage> {
  const listReportSessions = useListReportSessions()
  return usePagedList<ReportSession, ReportSessionPage>({
    queryKey: JSON.stringify(query),
    limit: PAGE_SIZE,
    load: (cursor) => listReportSessions({ ...query, cursor, limit: PAGE_SIZE }),
    fallback: (cursor) => fixtureSessionHistory(query, cursor, PAGE_SIZE),
  })
}

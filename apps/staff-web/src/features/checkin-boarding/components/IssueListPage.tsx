import { useCallback, useEffect, useState } from 'react'
import { Button } from '@staff-web/components/ui/button'
import { Card } from '@staff-web/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@staff-web/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@staff-web/components/ui/tabs'
import { F6_MOCK, type StaffApi } from '../api/index.ts'
import type { StaffCheckInRow, StaffCheckInView } from '../api/types.ts'
import { ErrorBanner } from './ErrorBanner.tsx'
import { Message } from './pills.tsx'
import { messageOf } from './errors.ts'
import { bagLabel, bookingName, dueBags, groupIssues } from './issues.ts'
import { formatBaht } from '../domain/format.ts'
import { MUTED, PANEL, ROW_BUTTON } from './styles.ts'

export interface IssueListPageProps {
  api: StaffApi
  /** The signed-in agent, named in the message the clearing writes. */
  agentName: string
  /** Opens the passenger at the counter, where the fee is taken. */
  onOpenPassenger: (checkInId: string) => void
}

type IssueTab = 'mismatches' | 'unpaid'

const SUBTITLE = "Name mismatches and unpaid excess fees on today's BKK flights. Every action goes to the audit log (Feature 15)."
const MISMATCH_NOTE = 'A name mismatch only flags the check-in; it never blocks it. Check the passport, then clear it.'
const UNPAID_NOTE = 'No bag tag is printed until the fee is paid at the counter. Open the passenger to take payment.'

/** The tabs are the design's chips: the open one is the blue chip, the other one is outlined. */
const TAB_TRIGGER =
  'h-[34px] flex-none rounded-[6px] border border-[#cbd5e1] bg-white px-3 text-sm font-semibold text-[#0a1424] hover:border-[#9aa6b8] hover:bg-[#f3f4f6] hover:text-[#0a1424] data-[state=active]:border-[#102544]! data-[state=active]:bg-[#eaf0fb]! data-[state=active]:text-[#1f408c]!'
const TAB_HEAD = 'h-auto px-3 py-2 text-xs font-normal uppercase tracking-wide text-[#677287]'

export function IssueListPage({ api, agentName, onOpenPassenger }: IssueListPageProps) {
  const [rows, setRows] = useState<StaffCheckInRow[]>([])
  const [details, setDetails] = useState<Record<string, StaffCheckInView>>({})
  const [tab, setTab] = useState<IssueTab>('mismatches')
  const [cleared, setCleared] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const groups = groupIssues(rows)
  const open = tab === 'mismatches' ? groups.mismatches : groups.unpaid
  const noIssues = groups.mismatches.length === 0 && groups.unpaid.length === 0

  const loadRows = useCallback(async () => {
    try {
      setRows(await api.search({}))
    } catch (err) {
      setError(messageOf(err))
    }
  }, [api])

  useEffect(() => {
    let cancelled = false
    api
      .search({})
      .then((found) => {
        if (!cancelled) setRows(found)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(messageOf(err))
      })
    return () => {
      cancelled = true
    }
  }, [api])

  // The rows of the open tab need their details: the names on the mismatch tab, the bags on the unpaid tab.
  const openIds = open.map((row) => row.id).join(',')
  useEffect(() => {
    if (!openIds) return
    const ids = openIds.split(',')
    let cancelled = false
    Promise.all(ids.map((id) => api.detail(id).catch(() => null))).then((views) => {
      if (cancelled) return
      const loaded = views.filter((view): view is StaffCheckInView => view !== null)
      if (loaded.length < ids.length) setError('Some passengers could not be loaded.')
      setDetails((previous) => {
        const next = { ...previous }
        for (const view of loaded) next[view.checkIn.id] = view
        return next
      })
    })
    return () => {
      cancelled = true
    }
  }, [api, openIds])

  const clearMismatch = async (row: StaffCheckInRow) => {
    const documentId = details[row.id]?.checkIn.document?.id
    if (!documentId) return
    setError(null)
    setBusy(true)
    try {
      await api.clearMismatch(documentId)
      setCleared(row.passengerName)
      await loadRows()
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="min-w-0">
        <h1 className="m-0 font-sans text-[36px] font-extrabold leading-[1.1] tracking-tight text-[#0a1424]">Issue list</h1>
        <p className={`mt-1 ${MUTED}`}>{SUBTITLE}</p>
      </div>

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      <Tabs value={tab} onValueChange={(value) => setTab(value as IssueTab)} className="gap-6">
        <TabsList className="h-auto flex-wrap gap-2 bg-transparent p-0 group-data-[orientation=horizontal]/tabs:h-auto">
          <TabsTrigger value="mismatches" className={TAB_TRIGGER}>
            Name mismatches ({groups.mismatches.length})
          </TabsTrigger>
          <TabsTrigger value="unpaid" className={TAB_TRIGGER}>
            Unpaid excess fees ({groups.unpaid.length})
          </TabsTrigger>
        </TabsList>

        {cleared ? (
          <Message tone="success">
            <strong>Name mismatch cleared</strong> for {cleared} by {agentName}. Sent to the audit log (Feature 15).
          </Message>
        ) : null}

        {noIssues ? <Message tone="success">No open issues.</Message> : null}

        {!noIssues ? (
          <TabsContent value="mismatches">
            <Card className={`${PANEL} min-w-0`}>
              <p className={`m-0 ${MUTED}`}>{MISMATCH_NOTE}</p>
              {groups.mismatches.length === 0 ? (
                <p className={`m-0 ${MUTED}`}>No name mismatch.</p>
              ) : (
                <Table className="text-sm">
                  <TableHeader>
                    <TableRow className="border-[#dbe2ea] hover:bg-transparent">
                      <TableHead className={`w-[23%] ${TAB_HEAD}`}>Passenger</TableHead>
                      <TableHead className={`w-[18%] ${TAB_HEAD}`}>Flight · Booking</TableHead>
                      <TableHead className={`w-[21%] ${TAB_HEAD}`}>Name on booking</TableHead>
                      <TableHead className={`w-[25%] ${TAB_HEAD}`}>Name on passport</TableHead>
                      <TableHead className="h-auto w-[13%] px-3 py-2" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {groups.mismatches.map((row) => {
                      const detail = details[row.id]
                      return (
                        <TableRow key={row.id} className="border-[#eef1f6] hover:bg-[#f7f9fc]">
                          <TableCell className="px-3 py-3 text-sm font-medium text-[#0a1424]">{row.passengerName}</TableCell>
                          <TableCell className="px-3 py-3 text-sm text-[#677287]">
                            {row.flightNumber} · {row.pnr}
                          </TableCell>
                          <TableCell className="px-3 py-3 text-sm text-[#0a1424]">
                            {detail ? bookingName(detail.checkIn.passenger) : '—'}
                          </TableCell>
                          <TableCell className="px-3 py-3 text-sm text-[#0a1424]">
                            {detail?.checkIn.document?.nameOnPassport ?? '—'}
                          </TableCell>
                          <TableCell className="px-3 py-3 text-right">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className={ROW_BUTTON}
                              disabled={busy || !detail?.checkIn.document}
                              onClick={() => void clearMismatch(row)}
                            >
                              Clear mismatch
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
            </Card>
          </TabsContent>
        ) : null}

        {!noIssues ? (
          <TabsContent value="unpaid">
            <Card className={`${PANEL} min-w-0`}>
              <p className={`m-0 ${MUTED}`}>{UNPAID_NOTE}</p>
              {groups.unpaid.length === 0 ? (
                <p className={`m-0 ${MUTED}`}>No unpaid excess fee.</p>
              ) : (
                <Table className="text-sm">
                  <TableHeader>
                    <TableRow className="border-[#dbe2ea] hover:bg-transparent">
                      <TableHead className={`w-[23%] ${TAB_HEAD}`}>Passenger</TableHead>
                      <TableHead className={`w-[18%] ${TAB_HEAD}`}>Flight · Booking</TableHead>
                      <TableHead className={`w-[21%] ${TAB_HEAD}`}>Bag</TableHead>
                      <TableHead className={`w-[25%] ${TAB_HEAD}`}>Fee due</TableHead>
                      <TableHead className="h-auto w-[13%] px-3 py-2" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {groups.unpaid.map((row) => {
                      const detail = details[row.id]
                      const bags = detail ? dueBags(detail.bags) : []
                      return (
                        <TableRow key={row.id} className="border-[#eef1f6] hover:bg-[#f7f9fc]">
                          <TableCell className="px-3 py-3 text-sm font-medium text-[#0a1424]">{row.passengerName}</TableCell>
                          <TableCell className="px-3 py-3 text-sm text-[#677287]">
                            {row.flightNumber} · {row.pnr}
                          </TableCell>
                          <TableCell className="px-3 py-3 text-sm text-[#0a1424]">
                            {bags.length > 0 ? bags.map(bagLabel).join(', ') : '—'}
                          </TableCell>
                          <TableCell className="px-3 py-3 text-sm font-medium text-[#d61313]">
                            {detail ? formatBaht(detail.totals.unpaidFee) : '—'}
                          </TableCell>
                          <TableCell className="px-3 py-3 text-right">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className={ROW_BUTTON}
                              onClick={() => onOpenPassenger(row.id)}
                            >
                              Open passenger
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
            </Card>
          </TabsContent>
        ) : null}
      </Tabs>

      {F6_MOCK ? <p className="m-0 text-xs text-[#677287]">Example passengers, bags and payments for the demo; not real data.</p> : null}
    </div>
  )
}

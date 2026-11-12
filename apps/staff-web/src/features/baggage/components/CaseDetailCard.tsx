import { Separator } from '@staff-web/components/ui/separator'
import type { BagMatch } from '../api/bag-matches'
import type { FoundBag } from '../api/found-bags'
import type { AddBagCostBody, BagCostSummary, LostReportCase } from '../api/lost-reports'
import { REPORT_STATUS_LABELS, REPORT_STATUS_TONES, bagSummary, formatEventTime, formatFlightDate } from '../constants'
import { displayPhone } from '../phone-number'
import { CaseCosts } from './CaseCosts'
import { CaseMatches } from './CaseMatches'
import { F10Card, Pill } from './primitives'

function Fact({ label, children }: { label: string; children: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-sm font-medium whitespace-nowrap text-[#677287]">{label}</dt>
      <dd className="min-w-0 flex-1 text-right text-base break-words text-[#14213d]">{children}</dd>
    </div>
  )
}

/**
 * "Card / Case detail" (frame 01b), with the case's matches and the "Link a found bag by hand" picker. The costs
 * section is frame 06's, shown here as well as on Deliveries so a case's costs can be entered before it has a delivery.
 */
export function CaseDetailCard({
  report,
  matches,
  heldBags,
  onLink,
  costs,
}: {
  report: LostReportCase
  matches: BagMatch[]
  heldBags: FoundBag[]
  onLink: (foundBagId: string) => Promise<unknown>
  costs: {
    summary: BagCostSummary | null
    loading: boolean
    error: string | null
    add: (body: AddBagCostBody) => Promise<void>
    remove: (costId: string) => Promise<void>
  }
}) {
  const contact = (report.contactPhone && displayPhone(report.contactPhone)) ?? report.contactEmail ?? 'Not given'

  return (
    <F10Card aria-labelledby="case-detail-title">
      <div className="flex flex-wrap items-center gap-3">
        <h2
          id="case-detail-title"
          className="m-0 font-sans text-[28px] font-bold tracking-[-1.4px] text-[#14213d] max-md:text-[22px] max-md:tracking-normal"
        >
          {report.caseNumber}
        </h2>
        <Pill tone={REPORT_STATUS_TONES[report.status]}>{REPORT_STATUS_LABELS[report.status]}</Pill>
      </div>

      <dl className="flex flex-col gap-2.5">
        <Fact label="Passenger">{`${report.passengerFirstName} ${report.passengerLastName}`}</Fact>
        <Fact label="Contact">{contact}</Fact>
        <Fact label="Flight">{`${report.flightNumber} · ${report.flightOrigin} to ${report.flightDestination} · ${formatFlightDate(report.flightDate)}`}</Fact>
        <Fact label="Bag">{bagSummary(report)}</Fact>
        <Fact label="Tag">{report.tagNumber ?? 'No tag'}</Fact>
        <Fact label="Reported">{`${formatEventTime(report.reportedAt)} · by ${report.reportedByStaffId ? 'staff' : 'customer'}`}</Fact>
      </dl>

      {report.description && (
        <p className="rounded-lg bg-[#eef0f4] px-3.5 py-3 text-base break-words text-[#14213d]">“{report.description}”</p>
      )}

      <CaseMatches
        key={`matches-${report.id}`}
        matches={matches}
        heldBags={heldBags}
        canLink={report.status === 'open' || report.status === 'lost'}
        onLink={onLink}
      />

      <Separator className="bg-[#d8dce6]" />

      <CaseCosts
        key={report.id}
        cancelled={report.status === 'cancelled'}
        summary={costs.summary}
        loading={costs.loading}
        error={costs.error}
        onAdd={costs.add}
        onRemove={costs.remove}
      />
    </F10Card>
  )
}

import { useState } from 'react'
import { CircleAlert, Download, Search } from 'lucide-react'
import { Button } from '@customer-web/components/ui/button'
import { Card, CardContent } from '@customer-web/components/ui/card'
import { CustomerShell } from '../components/CustomerShell'
import { FilterChips } from '../components/FilterChips'
import { PageTabs } from '../components/PageTabs'
import { ReceiptModal } from '../components/ReceiptModal'
import { ReceiptsSkeleton } from '../components/ReceiptSkeletons'
import { ReceiptTable } from '../components/ReceiptTable'
import { useReceipts } from '../hooks/useReceipts'
import { formatAmount, RECEIPT_FILTER_LABELS, RECEIPT_STATUS_LABELS } from '../receipt-copy'
import { RECEIPT_FILTERS, type ReceiptFilter, type ReceiptSummaryDto } from '../types'

/** A cell of the CSV, quoted so a comma in a description cannot break the file. */
function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

/** Downloads the receipts on screen as a CSV, so the customer can keep a copy. */
function exportReceipts(receipts: ReceiptSummaryDto[]) {
  const header = ['Receipt', 'Trip', 'Flight', 'Booking', 'Paid with', 'Total (USD)', 'Status']
  const rows = receipts.map((receipt) => [
    receipt.document_number,
    receipt.route ?? '',
    receipt.flight_number ?? '',
    receipt.booking_reference ?? '',
    receipt.paid_with,
    formatAmount(receipt.amount),
    RECEIPT_STATUS_LABELS[receipt.receipt_status],
  ])
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'flython-receipts.csv'
  link.click()
  URL.revokeObjectURL(url)
}

/**
 * The customer's receipts, newest first.
 *
 * One row per document: a card payment, a booking paid with miles and cash, a cargo invoice, an award booking with no
 * cash at all, a flight that has already gone, and a refunded booking with its credit note. The chips above the list
 * cut across the status — flights, cargo, the miles-and-cash ones, and the receipts a credit note is attached to.
 *
 * The frames put "My refunds" and "My vouchers" beside this list as tabs. Those are Features 5b and the compensation
 * feature, so they are drawn but not open.
 */
export function ReceiptsPage() {
  const [filter, setFilter] = useState<ReceiptFilter>('all')
  const [search, setSearch] = useState('')
  const [openReceiptId, setOpenReceiptId] = useState<string | null>(null)
  const list = useReceipts(filter, search)

  return (
    <CustomerShell
      title="Receipts"
      action={
        <Button type="button" variant="outline" onClick={() => exportReceipts(list.receipts)} disabled={list.receipts.length === 0}>
          <Download className="size-4" aria-hidden="true" />
          Export
        </Button>
      }
    >
      <div className="flex flex-col gap-4" role="tabpanel" aria-label="Receipts" id="receipts-panel">
        {/* The tabs ------------------------------------------------------- */}
        <PageTabs
          ariaLabel="Receipts, refunds and vouchers"
          value="receipts"
          panelId="receipts-panel"
          tabs={[
            { value: 'receipts', label: 'Receipts' },
            { value: 'refunds', label: 'My refunds', disabled: true, hint: 'Coming with feature 5b' },
            { value: 'vouchers', label: 'My vouchers', disabled: true, hint: 'Coming with the compensation feature' },
          ]}
        />

        {/* The search box ------------------------------------------------ */}
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            id="receipt-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search booking ref, receipt number or city (e.g. K7QF2M)"
            aria-label="Search your receipts"
            className="w-full rounded-lg border border-line bg-card py-3 pr-3 pl-11 text-sm text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          />
        </div>

        {/* The filter chips ---------------------------------------------- */}
        <FilterChips
          ariaLabel="Filter your receipts"
          value={filter}
          onChange={setFilter}
          options={RECEIPT_FILTERS.map((item) => ({ value: item, label: RECEIPT_FILTER_LABELS[item], count: list.counts[item] }))}
        />

        {/* The list ------------------------------------------------------- */}
        {list.loading && <ReceiptsSkeleton />}

        {!list.loading && list.error && (
          <Card className="border-danger-line/40 bg-danger-soft" role="alert">
            <CardContent className="flex items-start gap-3">
              <CircleAlert className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden="true" />
              <div>
                <h2 className="m-0 font-sans text-base font-semibold text-foreground">We could not load your receipts</h2>
                <p className="mt-1 text-sm text-muted-foreground break-words">{list.error}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {!list.loading && !list.error && list.receipts.length === 0 && (
          <Card>
            <CardContent>
              <h2 className="m-0 font-sans text-base font-semibold text-foreground">No receipts match</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Clear the search box to see every receipt. When you book a flight, add a bag or buy something on board, the receipt appears
                here.
              </p>
            </CardContent>
          </Card>
        )}

        {!list.loading && !list.error && list.receipts.length > 0 && (
          <ReceiptTable receipts={list.receipts} onOpen={(receipt) => setOpenReceiptId(receipt.id)} />
        )}

        {/* The note the frames put under the list ------------------------ */}
        {list.receipts.length > 0 && (
          <p className="m-0 text-sm text-muted-foreground">
            Select a receipt to see its details. A credit note is a separate document; the original receipt never changes. Miles-only
            bookings get a receipt too, showing 0.00 USD.
          </p>
        )}
      </div>

      {/* The receipt, opened over the list --------------------------------- */}
      {openReceiptId !== null && <ReceiptModal receiptId={openReceiptId} onClose={() => setOpenReceiptId(null)} />}
    </CustomerShell>
  )
}

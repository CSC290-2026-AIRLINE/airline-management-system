import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { CircleAlert, Download, ReceiptText, Search } from 'lucide-react'
import { Button } from '@customer-web/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@customer-web/components/ui/alert'
import { EmptyState } from '@customer-web/components/ui/empty-state'
import { Input } from '@customer-web/components/ui/input'
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
 * The frames put "My refunds" and "My vouchers" beside this list as tabs. Both are Feature 5b's pages, so the tabs open
 * them.
 */
export function ReceiptsPage() {
  const [filter, setFilter] = useState<ReceiptFilter>('all')
  const [search, setSearch] = useState('')
  const [openReceiptId, setOpenReceiptId] = useState<string | null>(null)
  const list = useReceipts(filter, search)
  const navigate = useNavigate()

  return (
    <CustomerShell
      title="Receipts"
      tabs={
        <PageTabs
          ariaLabel="Receipts, refunds and vouchers"
          value="receipts"
          onChange={(next) => void navigate({ to: next === 'vouchers' ? '/vouchers' : '/refunds' })}
          tabs={[
            { value: 'receipts', label: 'Receipts' },
            { value: 'refunds', label: 'My refunds' },
            { value: 'vouchers', label: 'My vouchers' },
          ]}
        />
      }
      action={
        <Button type="button" variant="outline" onClick={() => exportReceipts(list.receipts)} disabled={list.receipts.length === 0}>
          <Download aria-hidden="true" />
          Export
        </Button>
      }
    >
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          id="receipt-search"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search booking ref, receipt number or city (e.g. K7QF2M)"
          aria-label="Search your receipts"
          className="pl-9"
        />
      </div>

      <FilterChips
        ariaLabel="Filter your receipts"
        value={filter}
        onChange={setFilter}
        options={RECEIPT_FILTERS.map((item) => ({ value: item, label: RECEIPT_FILTER_LABELS[item], count: list.counts[item] }))}
      />

      {list.loading && <ReceiptsSkeleton />}

      {!list.loading && list.error && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>We could not load your receipts</AlertTitle>
          <AlertDescription className="break-words">{list.error}</AlertDescription>
        </Alert>
      )}

      {!list.loading && !list.error && list.receipts.length === 0 && (
        <EmptyState
          icon={ReceiptText}
          title="No receipts match"
          action={
            search ? (
              <Button variant="secondary" onClick={() => setSearch('')}>
                Clear search
              </Button>
            ) : undefined
          }
        >
          Clear the search box to see every receipt. When you book a flight, add a bag or buy something on board, the receipt appears here.
        </EmptyState>
      )}

      {!list.loading && !list.error && list.receipts.length > 0 && (
        <>
          <ReceiptTable receipts={list.receipts} onOpen={(receipt) => setOpenReceiptId(receipt.id)} />
          <p className="text-sm text-muted-foreground">
            Select a receipt to see its details. A credit note is a separate document; the original receipt never changes. Miles-only
            bookings get a receipt too, showing 0.00 USD.
          </p>
        </>
      )}

      {openReceiptId !== null && <ReceiptModal receiptId={openReceiptId} onClose={() => setOpenReceiptId(null)} />}
    </CustomerShell>
  )
}

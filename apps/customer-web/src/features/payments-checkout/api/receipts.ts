import { MOCK_RECEIPTS } from './mock-receipts'
import type { ReceiptDetailDto, ReceiptFilter, ReceiptListDto, ReceiptSummaryDto } from '../types'

/**
 * The mock customer receipts API.
 *
 * It answers with the same shapes as the backend's `GET /api/receipts` and `GET /api/receipts/:id`, so the pages can be
 * written against the real contract before the API is switched on.
 *
 * TODO(F5a): replace these two functions with calls to the backend (`fetchWithAuth('/api/receipts')` and
 * `fetchWithAuth('/api/receipts/:id')`). Nothing else in the feature changes when that happens.
 */

/** A short delay so the loading state is real rather than theoretical. */
const LATENCY_MS = 120

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** The list rows carry less than the detail page, so the detail-only fields are dropped here. */
function toSummary(receipt: ReceiptDetailDto): ReceiptSummaryDto {
  const { billing_name, card_brand, card_last4, lines, credit_note, ...summary } = receipt
  void billing_name
  void card_brand
  void card_last4
  void lines
  void credit_note
  return summary
}

/** Whether a receipt belongs on a filter chip. */
function matchesFilter(receipt: ReceiptSummaryDto, filter: ReceiptFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'flights') return receipt.source_feature === 3
  if (filter === 'cargo') return receipt.source_feature === 17
  if (filter === 'credit_note') return receipt.has_credit_note
  return receipt.receipt_status === filter
}

/** The search box takes a booking reference, a receipt number or a city. */
function matchesSearch(receipt: ReceiptSummaryDto, search: string | undefined): boolean {
  if (!search) return true
  const needle = search.trim().toLowerCase()
  if (!needle) return true
  return [receipt.document_number, receipt.booking_reference, receipt.route, receipt.title]
    .filter((value): value is string => typeof value === 'string')
    .some((value) => value.toLowerCase().includes(needle))
}

export interface ReceiptQuery {
  /** The chip the customer picked. */
  filter?: ReceiptFilter
  /** Free text: booking reference, receipt number or a city on the route. */
  search?: string
  limit?: number
}

/** The signed-in customer's receipts, newest first, with the counts the frames show on the chips. */
export async function listReceipts(query: ReceiptQuery = {}): Promise<ReceiptListDto> {
  await delay(LATENCY_MS)
  const summaries = MOCK_RECEIPTS.map(toSummary)

  const counts: ReceiptListDto['counts'] = { all: summaries.length, flights: 0, miles_and_cash: 0, cargo: 0, credit_note: 0 }
  for (const summary of summaries) {
    if (matchesFilter(summary, 'flights')) counts.flights += 1
    if (matchesFilter(summary, 'miles_and_cash')) counts.miles_and_cash += 1
    if (matchesFilter(summary, 'cargo')) counts.cargo += 1
    if (matchesFilter(summary, 'credit_note')) counts.credit_note += 1
  }

  const searched = summaries.filter((summary) => matchesSearch(summary, query.search))
  const filtered = searched.filter((summary) => query.filter === undefined || matchesFilter(summary, query.filter))
  const items = filtered.slice(0, query.limit ?? 50)
  return { items, total: filtered.length, counts }
}

/** One receipt. Throws the way the API throws, so the page can show the same "not found" state either way. */
export async function getReceipt(receiptId: string): Promise<ReceiptDetailDto> {
  await delay(LATENCY_MS)
  const found = MOCK_RECEIPTS.find((receipt) => receipt.id === receiptId)
  if (!found) {
    throw new Error(`404 Not Found: Receipt ${receiptId} not found`)
  }
  return found
}

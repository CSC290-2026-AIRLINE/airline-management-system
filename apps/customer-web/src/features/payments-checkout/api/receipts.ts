import { MOCK_RECEIPTS } from './mock-receipts'
import type { ListDto, ReceiptDetailDto, ReceiptSummaryDto } from '../types'

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

/** The signed-in customer's receipts, newest first. */
export async function listReceipts(): Promise<ListDto<ReceiptSummaryDto>> {
  await delay(LATENCY_MS)
  const items = MOCK_RECEIPTS.map(toSummary)
  return { items, total: items.length }
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

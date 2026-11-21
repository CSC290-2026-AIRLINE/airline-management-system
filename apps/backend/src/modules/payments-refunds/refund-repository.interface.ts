import type { BookingInfo, RefundablePayment, RefundRecord, VoucherRecord } from './refund.types'

/**
 * The DI token for the repository. The module provides the Prisma-backed implementation under this token; the tests
 * use the in-memory one.
 */
export const REFUND_REPOSITORY = 'REFUND_REPOSITORY'

/**
 * The seam between Feature 5b and the database.
 *
 * Everything above this interface is feature code; everything below it is storage. `PrismaRefundRepository` reads and
 * writes `refund`, `refund_line`, `compensation_voucher` and the `payment` rows they hang off; `InMemoryRefundRepository`
 * keeps the same rows in maps for the unit tests.
 *
 * Every method is asynchronous, because Prisma's are.
 */
export interface RefundRepository {
  listRefunds(): Promise<RefundRecord[]>
  findRefundById(id: string): Promise<RefundRecord | undefined>
  /** `REF-0121` (mock) or `REF-3FA9C21B` (stored): the reference staff read out loud. */
  findRefundByReference(reference: string): Promise<RefundRecord | undefined>
  /** Saves a new refund and returns it with its `reference` set. A refund with a `payment_line_id` also writes its `refund_line`. */
  insertRefund(refund: RefundRecord): Promise<RefundRecord>
  /** Saves the changes to a refund. A refund that stops counting (rejected or failed) gives its lines back. */
  updateRefund(refund: RefundRecord): Promise<RefundRecord>
  /**
   * Saves a refund and the voucher it returns together, so a refund never says "voucher issued" without the voucher, or
   * the other way round. `mode` says whether the refund is new or an existing one that changed.
   */
  saveRefundWithVoucher(
    refund: RefundRecord,
    voucher: VoucherRecord,
    mode: 'insert' | 'update',
  ): Promise<{ refund: RefundRecord; voucher: VoucherRecord }>

  listVouchers(): Promise<VoucherRecord[]>
  findVoucherById(id: string): Promise<VoucherRecord | undefined>
  findVoucherByCode(code: string): Promise<VoucherRecord | undefined>
  updateVoucher(voucher: VoucherRecord): Promise<VoucherRecord>

  /** The purchase a reference names, with the customer who paid. Undefined when no captured payment has that reference. */
  findBooking(reference: string): Promise<BookingInfo | undefined>
  /** The customer a signed-in user is. Undefined for a user with no customer account. */
  resolveCustomerId(userId: string): Promise<string | undefined>
  /** The customer's captured payments, with what is left to ask money back for on each line. */
  listRefundable(customerId: string): Promise<RefundablePayment[]>
  /** How long a voucher lasts, in months (`payment_setting.voucher_valid_months`). */
  voucherValidMonths(): Promise<number>
}

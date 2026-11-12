import type { CompensationEntryDto, CompensationFilter, CompensationListDto, IssueCompensationBody } from '../types'

/**
 * The compensation history, in memory.
 *
 * TODO(F5b): replace every function here with a call to `GET /api/staff/compensation`, `POST /api/staff/compensation`
 * and `POST /api/staff/vouchers/:id/void`. The shapes already match the backend's DTOs, so only this file changes.
 * What staff issue or void lasts until the page is reloaded.
 */

const DAY = 24 * 3_600_000
const ago = (ms: number) => new Date(Date.now() - ms).toISOString()

/** The bookings the mock knows. The real call looks the booking up in Feature 3b. */
const KNOWN_BOOKINGS = ['K7QF2M', 'R5NH7C', 'T9WE2L', 'Q2LV8R', 'M3XP9D', 'H2JD6A', 'F6RW9K', 'B8TN4W', 'W4NB8T']

/** The letters a voucher code may use (the schema leaves out I, O, 0 and 1). */
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

const seed = (): CompensationEntryDto[] => [
  {
    id: 'vch_00000000-0000-4000-8000-00000000a001',
    kind: 'voucher',
    booking_reference: 'Q2LV8R',
    value: 150,
    currency: 'USD',
    reference: 'VCH-7K2M-91QD',
    status_label: 'Active',
    reason: 'Flight cancelled',
    issued_at: ago(15 * DAY),
    can_void: true,
  },
  {
    id: 'vch_00000000-0000-4000-8000-00000000a002',
    kind: 'voucher',
    booking_reference: 'M3XP9D',
    value: 40,
    currency: 'USD',
    reference: 'VCH-3D8A-55TR',
    status_label: 'Expiring',
    reason: 'Delay over 3 hours',
    issued_at: ago(16 * DAY),
    can_void: true,
  },
  {
    id: 'vch_00000000-0000-4000-8000-00000000a003',
    kind: 'voucher',
    booking_reference: 'B8TN4W',
    value: 75,
    currency: 'USD',
    reference: 'VCH-1B6E-20WK',
    status_label: 'Redeemed',
    reason: 'Refund as voucher',
    issued_at: ago(21 * DAY),
    can_void: false,
  },
  {
    id: 'ref_00000000-0000-4000-8000-00000000a127',
    kind: 'card_refund',
    booking_reference: 'H2JD6A',
    value: 60,
    currency: 'USD',
    reference: 'RF-0127',
    status_label: 'Refunded',
    reason: 'Seat map error',
    issued_at: ago(14 * DAY),
    can_void: false,
  },
  {
    id: 'ref_00000000-0000-4000-8000-00000000a131',
    kind: 'card_refund',
    booking_reference: 'F6RW9K',
    value: 25,
    currency: 'USD',
    reference: 'RF-0131',
    status_label: 'Paying to card',
    reason: 'Charged twice for seat',
    issued_at: ago(1 * DAY),
    can_void: false,
  },
]

let rows = seed()
let nextRefund = 132

const wait = () => new Promise<void>((resolve) => setTimeout(resolve, 150))

export async function listCompensation(filter: CompensationFilter, search: string): Promise<CompensationListDto> {
  await wait()
  const needle = search.trim().toLowerCase()
  const matching = rows.filter(
    (row) =>
      !needle ||
      row.booking_reference.toLowerCase().includes(needle) ||
      row.reference.toLowerCase().includes(needle) ||
      row.reason.toLowerCase().includes(needle),
  )
  const items = matching
    .filter((row) => filter === 'all' || (filter === 'vouchers' ? row.kind === 'voucher' : row.kind === 'card_refund'))
    .sort((a, b) => Date.parse(b.issued_at) - Date.parse(a.issued_at))
  return {
    items,
    total: items.length,
    counts: {
      all: matching.length,
      vouchers: matching.filter((row) => row.kind === 'voucher').length,
      card_refunds: matching.filter((row) => row.kind === 'card_refund').length,
    },
  }
}

function newVoucherCode(): string {
  const pick = () => CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)]
  const part = () => Array.from({ length: 4 }, pick).join('')
  return `VCH-${part()}-${part()}`
}

export async function issueCompensation(body: IssueCompensationBody): Promise<CompensationEntryDto> {
  await wait()
  const booking = body.booking_reference.trim().toUpperCase()
  if (!KNOWN_BOOKINGS.includes(booking)) throw new Error(`Booking ${booking} was not found.`)

  const isVoucher = body.kind === 'voucher'
  const entry: CompensationEntryDto = {
    id: `${isVoucher ? 'vch' : 'ref'}_${crypto.randomUUID()}`,
    kind: body.kind,
    booking_reference: booking,
    value: body.amount,
    currency: 'USD',
    reference: isVoucher ? newVoucherCode() : `RF-${String(nextRefund++).padStart(4, '0')}`,
    status_label: isVoucher ? 'Active' : 'Paying to card',
    reason: body.reason.trim(),
    issued_at: new Date().toISOString(),
    can_void: isVoucher,
  }
  rows = [entry, ...rows]
  return entry
}

export async function voidVoucher(id: string): Promise<CompensationEntryDto> {
  await wait()
  const current = rows.find((row) => row.id === id)
  if (!current) throw new Error('Voucher not found.')
  if (!current.can_void) throw new Error(`${current.reference} is ${current.status_label.toLowerCase()} and cannot be voided.`)
  const next = { ...current, status_label: 'Voided', can_void: false }
  rows = rows.map((row) => (row.id === id ? next : row))
  return next
}

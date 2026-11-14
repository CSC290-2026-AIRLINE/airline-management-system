import { createFileRoute } from '@tanstack/react-router'
import { CargoDeskPage } from '@staff-web/features/cargo/CargoDeskPage'

const VALID_STATUSES = [
  'all',
  'held',
  'booked',
  'accepted',
  'loaded',
  'in_transit',
  'arrived',
  'delivered',
  'rebook_required',
  'closed',
] as const

export type CargoDeskStatus = (typeof VALID_STATUSES)[number]

export const Route = createFileRoute('/_authenticated/cargo/bookings')({
  component: CargoDeskPage,
  validateSearch: (search: Record<string, unknown>): { status: CargoDeskStatus } => {
    const raw = search.status
    const status = VALID_STATUSES.includes(raw as CargoDeskStatus) ? (raw as CargoDeskStatus) : 'all'
    return { status }
  },
})

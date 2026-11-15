import { createFileRoute } from '@tanstack/react-router'
import { CargoDeskPage } from '@staff-web/features/cargo/CargoDeskPage'

const VALID_STATUSES = ['held', 'booked', 'accepted', 'loaded', 'in_transit', 'arrived', 'delivered', 'rebook_required', 'closed'] as const

export type CargoDeskStatus = (typeof VALID_STATUSES)[number]

export const Route = createFileRoute('/_authenticated/cargo/bookings/')({
  component: CargoDeskPage,
  validateSearch: (
    search: Record<string, unknown>,
  ): { status: CargoDeskStatus; flight?: string; shipDate?: string; commodity?: string } => {
    const raw = search.status
    const status = VALID_STATUSES.includes(raw as CargoDeskStatus) ? (raw as CargoDeskStatus) : 'booked'
    return {
      status,
      flight: typeof search.flight === 'string' && search.flight ? search.flight : undefined,
      shipDate: typeof search.shipDate === 'string' && search.shipDate ? search.shipDate : undefined,
      commodity: typeof search.commodity === 'string' && search.commodity ? search.commodity : undefined,
    }
  },
})

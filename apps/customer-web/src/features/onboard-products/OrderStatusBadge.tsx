// Status pill for a product order. Renders one or two badges depending on
// the order's lifecycle state. The Figma only shows the
// `confirmed + paid` case; the other four are here so the page can show
// any of the lifecycle states the backend may return (spec lifecycle:
// pending_payment → confirmed | cancelled | expired | void).

import { Badge } from '../../components/ui/badge'
import type { ProductOrderStatus } from './types'

interface Props {
  status: ProductOrderStatus
  paidAt: string | null
  refundRequestedAt: string | null
}

interface BadgeRow {
  primary: { label: string; tone: BadgeTone }
  payment: { label: string; tone: BadgeTone } | null
}

type BadgeTone = 'success' | 'pending' | 'destructive' | 'muted' | 'cancelled' | 'warning'

const TONE_TO_VARIANT: Record<BadgeTone, 'success' | 'pending' | 'destructive' | 'muted' | 'cancelled' | 'warning'> = {
  success: 'success',
  pending: 'pending',
  destructive: 'destructive',
  muted: 'muted',
  cancelled: 'cancelled',
  warning: 'warning',
}

function rowFor(status: ProductOrderStatus, paidAt: string | null, refundRequestedAt: string | null): BadgeRow {
  switch (status) {
    case 'confirmed':
      if (paidAt) {
        return {
          primary: { label: 'Confirmed', tone: 'success' },
          payment: { label: 'Paid', tone: 'success' },
        }
      }
      return {
        primary: { label: 'Confirmed', tone: 'success' },
        payment: { label: 'Awaiting payment', tone: 'pending' },
      }
    case 'pending_payment':
      return {
        primary: { label: 'Pending payment', tone: 'pending' },
        payment: null,
      }
    case 'cancelled':
      if (refundRequestedAt) {
        // Refund in flight: demote the "Cancelled" chip to a neutral
        // grey so the amber "Refund requested" chip carries the
        // attention. Plain "cancelled" stays red — there's no amber
        // competitor, and red is the right level of urgency.
        return {
          primary: { label: 'Cancelled', tone: 'cancelled' },
          payment: { label: 'Refund requested', tone: 'warning' },
        }
      }
      return {
        primary: { label: 'Cancelled', tone: 'destructive' },
        payment: null,
      }
    case 'expired':
      return {
        primary: { label: 'Expired', tone: 'muted' },
        payment: null,
      }
    case 'void':
      return {
        primary: { label: 'Voided', tone: 'muted' },
        payment: null,
      }
  }
}

export function OrderStatusBadge({ status, paidAt, refundRequestedAt }: Props) {
  const row = rowFor(status, paidAt, refundRequestedAt)
  return (
    <div className="inline-flex items-center justify-end gap-2 flex-wrap" aria-label={`Status: ${row.primary.label}`}>
      <Badge variant={TONE_TO_VARIANT[row.primary.tone]}>{row.primary.label}</Badge>
      {row.payment && <Badge variant={TONE_TO_VARIANT[row.payment.tone]}>{row.payment.label}</Badge>}
    </div>
  )
}

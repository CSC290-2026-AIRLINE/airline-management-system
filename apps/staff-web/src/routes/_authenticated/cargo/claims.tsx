import { createFileRoute } from '@tanstack/react-router'
import { ClaimsPage } from '@staff-web/features/cargo/ClaimsPage'

const VALID_STATUSES = ['all', 'open', 'decided'] as const

export type ClaimFilterStatus = (typeof VALID_STATUSES)[number]

export const Route = createFileRoute('/_authenticated/cargo/claims')({
  component: ClaimsPage,
  validateSearch: (search: Record<string, unknown>): { status: ClaimFilterStatus } => {
    const raw = search.status
    const status = VALID_STATUSES.includes(raw as ClaimFilterStatus) ? (raw as ClaimFilterStatus) : 'all'
    return { status }
  },
})

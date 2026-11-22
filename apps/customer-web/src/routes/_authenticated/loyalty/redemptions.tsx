import { createFileRoute } from '@tanstack/react-router'
import { LoyaltyError, RedemptionsRoutePage } from '../../../features/loyalty/components/LoyaltyPages'

export const Route = createFileRoute('/_authenticated/loyalty/redemptions')({
  component: RedemptionsRoutePage,
  errorComponent: LoyaltyError,
})

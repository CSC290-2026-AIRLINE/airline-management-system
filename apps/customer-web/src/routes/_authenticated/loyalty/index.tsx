import { createFileRoute } from '@tanstack/react-router'
import { LoyaltyError, LoyaltyHomePage } from '../../../features/loyalty/components/LoyaltyPages'

export const Route = createFileRoute('/_authenticated/loyalty/')({
  component: LoyaltyHomePage,
  errorComponent: LoyaltyError,
})

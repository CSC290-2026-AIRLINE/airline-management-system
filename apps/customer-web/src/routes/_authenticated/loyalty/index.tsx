import { createFileRoute } from '@tanstack/react-router'
import { LoyaltyHomePage } from '../../../features/loyalty/components/LoyaltyHomePage'

export const Route = createFileRoute('/_authenticated/loyalty/')({
  component: LoyaltyHomePage,
})

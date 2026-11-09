import { createFileRoute } from '@tanstack/react-router'
import { BenefitsRoutePage, LoyaltyError } from '../../../features/loyalty/components/LoyaltyPages'

export const Route = createFileRoute('/_authenticated/loyalty/benefits')({
  component: BenefitsRoutePage,
  errorComponent: LoyaltyError,
})

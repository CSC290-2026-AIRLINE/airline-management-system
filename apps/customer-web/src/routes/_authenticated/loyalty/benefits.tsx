import { createFileRoute } from '@tanstack/react-router'
import { BenefitsPage } from '../../../features/loyalty/components/BenefitsPage'

export const Route = createFileRoute('/_authenticated/loyalty/benefits')({
  component: BenefitsPage,
})

import { createFileRoute } from '@tanstack/react-router'
import { RedemptionsPage } from '../../../features/loyalty/components/RedemptionsPage'

export const Route = createFileRoute('/_authenticated/loyalty/redemptions')({
  component: RedemptionsPage,
})

import { createFileRoute } from '@tanstack/react-router'
import { LoungeDeskPage } from '../../../features/loyalty/components/LoungeDeskPage'

export const Route = createFileRoute('/_authenticated/loyalty/lounge')({
  component: LoungeDeskPage,
})

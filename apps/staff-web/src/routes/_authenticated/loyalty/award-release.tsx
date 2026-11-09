import { createFileRoute } from '@tanstack/react-router'
import { AwardReleasePage } from '../../../features/loyalty/components/AwardReleasePage'

export const Route = createFileRoute('/_authenticated/loyalty/award-release')({
  component: AwardReleasePage,
})

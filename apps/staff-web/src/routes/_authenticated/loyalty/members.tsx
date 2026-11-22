import { createFileRoute } from '@tanstack/react-router'
import { MembersPage } from '../../../features/loyalty/components/MembersPage'

export const Route = createFileRoute('/_authenticated/loyalty/members')({
  component: MembersPage,
})

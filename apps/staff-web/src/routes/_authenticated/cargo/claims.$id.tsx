import { createFileRoute } from '@tanstack/react-router'
import { ClaimDetailPage } from '@staff-web/features/cargo/ClaimDetailPage'

export const Route = createFileRoute('/_authenticated/cargo/claims/$id')({
  component: ClaimDetailPage,
})

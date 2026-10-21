import { createFileRoute } from '@tanstack/react-router'
import { RoleAccessPage } from '@staff-web/features/admin-console/pages/RoleAccessPage'

export const Route = createFileRoute('/_authenticated/admin/roles')({
  component: RoleAccessPage,
})

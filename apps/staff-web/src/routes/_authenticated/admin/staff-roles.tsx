import { createFileRoute } from '@tanstack/react-router'
import { StaffRolesPage } from '@staff-web/features/admin-console/pages/StaffRolesPage'

export const Route = createFileRoute('/_authenticated/admin/staff-roles')({
  component: StaffRolesPage,
})

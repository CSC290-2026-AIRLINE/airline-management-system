import { createFileRoute } from '@tanstack/react-router'
import { RequireStaff } from '@staff-web/features/admin-console/components/RequireStaff'
import { CargoShell } from '@staff-web/features/cargo/CargoShell'

export const Route = createFileRoute('/_authenticated/cargo')({
  component: CargoLayout,
})

function CargoLayout() {
  return (
    <RequireStaff>
      <CargoShell />
    </RequireStaff>
  )
}

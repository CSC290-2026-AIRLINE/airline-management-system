import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/cargo')({
  component: CargoLayout,
})

function CargoLayout() {
  return <Outlet />
}

import { createFileRoute } from '@tanstack/react-router'
import ShipCargoPage from '@customer-web/features/cargo/ShipCargoPage'

export const Route = createFileRoute('/_authenticated/cargo/ship')({ component: ShipCargoPage })

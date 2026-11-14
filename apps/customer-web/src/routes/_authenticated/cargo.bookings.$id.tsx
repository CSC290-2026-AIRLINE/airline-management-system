import { createFileRoute } from '@tanstack/react-router'
import ShipmentDetailPage from '@customer-web/features/cargo/ShipmentDetailPage'

export const Route = createFileRoute('/_authenticated/cargo/bookings/$id')({ component: ShipmentDetailPage })

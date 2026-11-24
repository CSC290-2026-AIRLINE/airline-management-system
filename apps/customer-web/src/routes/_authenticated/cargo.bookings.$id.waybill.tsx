import { createFileRoute } from '@tanstack/react-router'
import AirWaybillPage from '@customer-web/features/cargo/AirWaybillPage'

export const Route = createFileRoute('/_authenticated/cargo/bookings/$id/waybill')({ component: AirWaybillPage })

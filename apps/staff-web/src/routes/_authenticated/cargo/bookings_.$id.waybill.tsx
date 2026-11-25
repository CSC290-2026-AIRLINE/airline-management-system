import { createFileRoute } from '@tanstack/react-router'
import { AirWaybillPage } from '@staff-web/features/cargo/AirWaybillPage'

export const Route = createFileRoute('/_authenticated/cargo/bookings_/$id/waybill')({
  component: AirWaybillPage,
})

import { createFileRoute } from '@tanstack/react-router'
import { PassengerLostBagReportPage } from '../../features/baggage/pages/PassengerLostBagReportPage'

export const Route = createFileRoute('/_authenticated/report-lost-bag')({
  component: PassengerLostBagReportPage,
})

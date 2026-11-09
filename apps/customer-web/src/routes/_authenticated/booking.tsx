import { createFileRoute } from '@tanstack/react-router'
import { BookingFlowPage } from '../../features/booking-pnr/flow/BookingFlowPage'

export const Route = createFileRoute('/_authenticated/booking')({ component: BookingFlowPage })

import { createFileRoute } from '@tanstack/react-router'
import { PassengerLostBagCasePage } from '../../features/baggage/pages/PassengerLostBagCasePage'

export const Route = createFileRoute('/_authenticated/lost-bag-case')({
  component: PassengerLostBagCasePage,
})

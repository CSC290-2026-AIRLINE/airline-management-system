// Receive delivery page. Reached only from the Stock "Receive delivery"
// button (?airport=… carries the chosen airport). Does not show current
// stock; staff add one row per item and press Confirm receive.

import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { ReceiveDeliveryPage } from '@staff-web/features/onboard-products/stock/ReceiveDeliveryPage'

const receiveSearchSchema = z.object({
  airport: z.string().optional(),
})

export const Route = createFileRoute('/_authenticated/catering/stock/receive')({
  component: ReceiveDeliveryPage,
  validateSearch: receiveSearchSchema,
})

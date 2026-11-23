// Stock page. Mirrors the prototype: airport picker with Receive delivery
// button, then a warehouse stock table with an Adjust stock dialog and a
// recent movements list. Fills the full content width.

import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { StockPage } from '@staff-web/features/onboard-products/stock/StockPage'

const stockSearchSchema = z.object({
  airport: z.string().optional(),
})

export const Route = createFileRoute('/_authenticated/catering/stock/')({
  component: StockPage,
  validateSearch: stockSearchSchema,
})

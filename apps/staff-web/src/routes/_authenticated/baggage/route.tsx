import { createFileRoute } from '@tanstack/react-router'
import { BaggageShell } from '@staff-web/features/baggage/BaggageShell'

/** Feature 10 staff screens (lost and found baggage). The backend checks for an active staff account on every call. */
export const Route = createFileRoute('/_authenticated/baggage')({
  component: BaggageShell,
})

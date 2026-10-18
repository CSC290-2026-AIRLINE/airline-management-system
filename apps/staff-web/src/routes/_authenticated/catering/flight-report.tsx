import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/catering/flight-report')({
  component: FlightReportPlaceholder,
})

function FlightReportPlaceholder() {
  return (
    <section>
      <h1>Flight Report</h1>
    </section>
  )
}

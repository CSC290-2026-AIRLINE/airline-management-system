type FlightOriginCase = { flightOrigin: string }
type StatusCase = { status: string }

/** Build the filter choices from origins present in the cases returned by the authorized staff API. */
export function getFlightOriginOptions<T extends FlightOriginCase>(cases: readonly T[]): string[] {
  return [...new Set(cases.map((item) => item.flightOrigin.trim().toUpperCase()).filter(Boolean))].sort()
}

/** Keep the existing status filter and apply the optional departure-airport filter alongside it. */
export function filterLostReportCases<T extends FlightOriginCase & StatusCase>(
  cases: readonly T[],
  statuses: readonly string[],
  flightFrom: string | undefined,
): T[] {
  return cases.filter((item) => statuses.includes(item.status) && (!flightFrom || item.flightOrigin.trim().toUpperCase() === flightFrom))
}

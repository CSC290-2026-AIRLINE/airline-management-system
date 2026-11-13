// How fare quotes learn how full a flight is, for the load rules. Feature 3b owns seat inventory.
// A thrown error becomes 502 UPSTREAM_UNAVAILABLE on the quote.
export abstract class SeatAvailability {
  abstract seatsLeftPct(flightId: string, cabin: string): Promise<number> // 0 to 100
}

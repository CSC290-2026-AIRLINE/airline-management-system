// Mock data for the flight report screen.

import type { FlightReport } from '../api/types'

export const mockFlightReport: FlightReport = {
  id: 'fr-001',
  flightId: 'f-308',
  flightNumber: 'FL308',
  route: 'BKK → NRT',
  status: 'submitted',
  submittedAt: '2026-10-22T15:42:00Z',
  lines: [
    {
      id: 'frl-1',
      productId: 'p-001',
      productName: 'Chicken with rice',
      initialQuantity: 120,
      served: 108,
      sold: 0,
      wasted: 12,
      damaged: 0,
      remaining: 0,
    },
    {
      id: 'frl-2',
      productId: 'p-005',
      productName: 'Mixed nuts',
      initialQuantity: 42,
      served: 30,
      sold: 6,
      wasted: 0,
      damaged: 0,
      remaining: 6,
    },
    {
      id: 'frl-3',
      productId: 'p-006',
      productName: 'Sparkling water 330ml',
      initialQuantity: 200,
      served: 140,
      sold: 12,
      wasted: 0,
      damaged: 0,
      remaining: 48,
    },
  ],
}

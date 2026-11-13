import type { seat_inventory } from '@backend/db/generated/prisma/client'

// The seats a cash buyer can still take: the cabin minus what is held or sold, minus the award seats that are
// still free. Award seats that are already used are counted once, inside the held and sold counts.
export function cashSeats(row: seat_inventory): number {
  return Math.max(0, row.capacity - row.held_count - row.sold_count - (row.award_limit - row.award_held_count - row.award_sold_count))
}

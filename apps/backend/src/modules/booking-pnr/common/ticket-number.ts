import type { BookingTransaction } from '../contracts'

export function formatTicketNumber(airlineNumber: string, sequence: bigint | number): string {
  if (!/^[0-9]{3}$/.test(airlineNumber)) {
    throw new Error('The airline number must be three digits')
  }
  return `${airlineNumber}${BigInt(sequence).toString().padStart(10, '0')}`
}

export async function nextTicketNumber(tx: BookingTransaction, airlineNumber: string): Promise<string> {
  const rows = await tx.$queryRaw<Array<{ nextval: bigint }>>`SELECT nextval('ticket_number_seq') AS nextval`
  const sequence = rows[0]?.nextval
  if (sequence === undefined) {
    throw new Error('ticket_number_seq did not return a value')
  }
  return formatTicketNumber(airlineNumber, sequence)
}

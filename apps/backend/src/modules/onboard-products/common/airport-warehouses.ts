import type { PrismaClient } from '../../../db/generated/prisma/client'

// F2 and other importers can add airports after the F12 seed has run.
export async function provisionAirportWarehouses(db: Pick<PrismaClient, 'airport' | 'warehouse'>, airportCodes?: string[]) {
  if (airportCodes?.length === 0) return
  const airports = await db.airport.findMany({
    where: { is_active: true, ...(airportCodes ? { iata_code: { in: airportCodes } } : {}), warehouse: { is: null } },
    select: { iata_code: true },
  })
  if (airports.length === 0) return
  await db.warehouse.createMany({
    data: airports.map(({ iata_code: code }) => ({ airport_code: code, code: `WH-${code}`, name: `${code} Catering Warehouse` })),
    skipDuplicates: true,
  })
}

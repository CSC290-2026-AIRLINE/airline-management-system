import type { PrismaClient } from '@backend/db/generated/prisma/client'

/**
 * The one aircraft type every crew-rostering seed flies: the shared `db/seed.ts` A320 (code `A320`, model `A320-200`).
 *
 * These seeds used to create their own `A320-V1` type with model `A320`. A database holding both had crew rated on
 * `A320` and the shared seed's flights on `A320-200`, so every seat on those flights broke WRONG_FLEET. Using the
 * shared type means the seeded crew can fly any A320 flight, whichever seed made it.
 */
const FLEET_TYPE = {
  code: 'A320',
  manufacturer: 'Airbus',
  model: 'A320-200',
  layout: { rows: 30, seats_per_row: 6 },
  hold_weight_limit_kg: 20000,
  max_takeoff_weight_kg: 78000,
  max_range_km: 6100,
  min_turnaround_minutes: 50,
  operating_cost_per_hour: 4500,
  cost_currency: 'USD',
}

/** The model the seeds wrote before; `alignSeededFleet` moves rows still holding it. */
const LEGACY_MODEL = 'A320'

/** The shared A320 type, created with the shared seed's values when that seed has not run. */
export async function ensureFleetType(prisma: PrismaClient): Promise<{ id: string; model: string }> {
  const select = { id: true, model: true }
  return (
    (await prisma.aircraft_type.findFirst({ where: { code: FLEET_TYPE.code, deleted_at: null }, select })) ??
    (await prisma.aircraft_type.create({ data: FLEET_TYPE, select }))
  )
}

/**
 * Moves a database seeded before this change onto the shared type: the seed's own tails, and the type rating and fleet
 * of its own crew (employee numbers starting `crewPrefix`). Rows anyone else made are left alone.
 */
export async function alignSeededFleet(
  prisma: PrismaClient,
  type: { id: string; model: string },
  tails: readonly string[],
  crewPrefix?: string,
): Promise<void> {
  await prisma.aircraft.updateMany({
    where: { tail_number: { in: [...tails] }, deleted_at: null, aircraft_type_id: { not: type.id } },
    data: { aircraft_type_id: type.id },
  })
  if (crewPrefix === undefined || type.model === LEGACY_MODEL) return

  const ownCrew = { employee_number: { startsWith: crewPrefix } }
  await prisma.crew_certification.updateMany({
    where: { aircraft_type: LEGACY_MODEL, crew: ownCrew },
    data: { aircraft_type: type.model },
  })
  await prisma.crew.updateMany({ where: { ...ownCrew, fleet_aircraft_type: LEGACY_MODEL }, data: { fleet_aircraft_type: type.model } })
}

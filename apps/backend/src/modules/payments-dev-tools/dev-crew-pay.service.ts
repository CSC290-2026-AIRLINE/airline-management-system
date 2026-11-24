import { randomInt } from 'node:crypto'
import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { CrewPayService } from '@backend/modules/payments-crew-pay/crew-pay.service'

/**
 * TODO(F5-dev): delete with the rest of `payments-dev-tools` before the PR merges.
 *
 * Sample crew work to price, until Feature 8 produces real pairings. The logic is the dev fixture of
 * `payments-crew-pay/demo/crew-pay-fixture.ts`, moved into the app so it is a button, with the removal the fixture did
 * not have. It WRITES INTO OTHER TEAMS' TABLES, which app code never does: `crew` (F8), `aircraft_type`, `aircraft`,
 * `flight` (F2), `roster_run`, `roster_run_pairing`, `pairing`, `pairing_leg`, `pairing_leg_assignment` (F8). Every row
 * it makes is found again by a fixed tag (crew `F5C-…`, aircraft `HS-FVC`, type `F5-DEMO`) so `remove` takes out only
 * those.
 *
 * What it cannot take back: pricing and paying write `finance_posting` rows, and that table is append-only by design
 * (a trigger refuses updates and deletes). On a development database they stay behind.
 */
const DEMO_TYPE_CODE = 'F5-DEMO'
const DEMO_TAIL = 'HS-FVC'
const CREW_PREFIX = 'F5C-'
const BKK_OFFSET_HOURS = 7

const CREW = [
  { employee_number: 'F5C-001', first_name: 'Anan', last_name: 'Srisuk', role: 'captain', email: 'anan.s@crew.flython.test' },
  // No payout contact on purpose: the fake payout provider refuses this person's payout, so the failed-payout path can be
  // tried (Pay Runs -> Retry). Add an email to the crew record and retry to see it succeed.
  { employee_number: 'F5C-002', first_name: 'Ploy', last_name: 'Chaiyo', role: 'first_officer', email: null },
  { employee_number: 'F5C-003', first_name: 'Mali', last_name: 'Thongdee', role: 'cabin_crew', email: 'mali.t@crew.flython.test' },
] as const

/** The pairing, as local Bangkok times relative to its first day. */
const LEGS = [
  { from: 'BKK', to: 'CNX', day: 0, dep: '06:00' },
  { from: 'CNX', to: 'BKK', day: 0, dep: '16:00' },
  { from: 'BKK', to: 'HKT', day: 1, dep: '08:00' },
  { from: 'HKT', to: 'BKK', day: 1, dep: '12:00' },
] as const

export interface DevCrewPayStatusDto {
  /** The signed-in user is a staff member, which seeding needs (it links one sample crew member to them). */
  you_are_staff: boolean
  crew: { id: string; name: string; role: string; employee_number: string; linked_to_you: boolean }[]
  flights: number
  accrued_lines: number
  in_run_lines: number
  paid_lines: number
  runs: number
}

export interface DevCrewPaySeedDto {
  pairing_code: string | null
  from: string
  to: string
  crew: string[]
  /** How many pairings the pricing run priced straight away (this one). */
  pairings_priced: number
  linked_to: string | null
}

/** A Bangkok local date + time as a UTC instant. */
function bangkok(day: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), h - BKK_OFFSET_HOURS, m))
}

@Injectable()
export class DevCrewPayService {
  constructor(
    private readonly db: DbService,
    private readonly crewPay: CrewPayService,
  ) {}

  private async staffOf(userId: string) {
    const staff = await this.db.staff.findFirst({ where: { user_id: userId, deleted_at: null } })
    if (!staff) throw new ForbiddenException('Sign in as a staff member to use the crew pay test tools')
    return staff
  }

  private demoCrew() {
    return this.db.crew.findMany({
      where: { employee_number: { startsWith: CREW_PREFIX }, deleted_at: null },
      orderBy: { employee_number: 'asc' },
    })
  }

  /** What sample data exists, and where it is in the pay flow. */
  async status(userId: string): Promise<DevCrewPayStatusDto> {
    const me = await this.db.staff.findFirst({ where: { user_id: userId, deleted_at: null }, select: { id: true } })
    const crew = await this.demoCrew()
    const crewIds = crew.map((c) => c.id)
    const aircraft = await this.db.aircraft.findFirst({ where: { tail_number: DEMO_TAIL }, select: { id: true } })
    const lines = await this.db.payroll_line.groupBy({ by: ['status'], where: { crew_id: { in: crewIds } }, _count: { _all: true } })
    const count = (status: string) => lines.find((l) => l.status === status)?._count._all ?? 0
    const runs = await this.db.payroll_line.findMany({
      where: { crew_id: { in: crewIds }, pay_run_id: { not: null } },
      distinct: ['pay_run_id'],
      select: { pay_run_id: true },
    })
    return {
      you_are_staff: me !== null,
      crew: crew.map((c) => ({
        id: c.id,
        name: `${c.first_name} ${c.last_name}`,
        role: c.role,
        employee_number: c.employee_number,
        linked_to_you: me !== null && c.staff_id === me.id,
      })),
      flights: aircraft ? await this.db.flight.count({ where: { aircraft_id: aircraft.id } }) : 0,
      accrued_lines: count('accrued'),
      in_run_lines: count('in_run'),
      paid_lines: count('paid'),
      runs: runs.length,
    }
  }

  /**
   * Adds one worked pairing: four flights that have all arrived, flown by the three sample crew. The first duty day is
   * 12.25 h, so with the 10 h threshold it earns 2.25 h of overtime, and the night away earns one per diem. The pricing
   * run is asked for straight away, so the lines are there when the call returns. The cabin crew member is linked to the
   * signed-in staff member (when neither is linked yet), so My Pay shows their pay.
   */
  async seed(userId: string): Promise<DevCrewPaySeedDto> {
    const me = await this.staffOf(userId)
    const crew = await this.ensureCrew(me.id)
    const aircraft = await this.demoAircraft()

    // Each pairing goes a week further back, so pairings never overlap on the sample aircraft. Every leg has arrived.
    const earlier = await this.db.flight.count({ where: { aircraft_id: aircraft.id } })
    const firstDay = new Date()
    firstDay.setUTCHours(0, 0, 0, 0)
    firstDay.setUTCDate(firstDay.getUTCDate() - 3 - 7 * Math.floor(earlier / LEGS.length))

    const routes = await this.db.route.findMany({ where: { origin: { in: ['BKK', 'CNX', 'HKT'] } } })
    const flights: { id: string }[] = []
    for (const leg of LEGS) {
      const route = routes.find((r) => r.origin === leg.from && r.destination === leg.to)
      if (!route) throw new ConflictException(`Route ${leg.from}-${leg.to} is missing. Run npm run db:seed first.`)
      const day = new Date(firstDay.getTime() + leg.day * 86_400_000)
      const dep = bangkok(day, leg.dep)
      const arr = new Date(dep.getTime() + route.block_time_min * 60_000)
      flights.push(
        await this.db.flight.create({
          data: {
            flight_number: `FL8${String(randomInt(100, 999))}`,
            service_date: new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate())),
            route_id: route.id,
            scheduled_dep_at: dep,
            scheduled_arr_at: arr,
            dep_at: dep,
            arr_at: arr,
            aircraft_id: aircraft.id,
            status: 'arrived',
          },
          select: { id: true },
        }),
      )
    }

    const dateTo = new Date(firstDay.getTime() + 86_400_000)
    const pairing = await this.db.$transaction(async (tx) => {
      const roster = await tx.roster_run.create({
        data: { base_airport: 'BKK', date_from: firstDay, date_to: dateTo, status: 'published', published_at: new Date() },
      })
      const created = await tx.pairing.create({ data: { base_airport: 'BKK' } })
      await tx.roster_run_pairing.create({ data: { roster_run_id: roster.id, pairing_id: created.id } })
      for (const flight of flights) {
        const leg = await tx.pairing_leg.create({ data: { pairing_id: created.id, flight_id: flight.id } })
        for (const member of crew) {
          await tx.pairing_leg_assignment.create({
            data: {
              pairing_id: created.id,
              pairing_leg_id: leg.id,
              crew_id: member.id,
              role: member.role,
              assigned_by: 'auto',
              assigned_at: new Date(),
            },
          })
        }
      }
      return created
    })

    const priced = await this.crewPay.pricePendingPairings()
    const linked = await this.db.crew.findFirst({ where: { staff_id: me.id } })
    return {
      pairing_code: (pairing as { code?: string }).code ?? null,
      from: firstDay.toISOString().slice(0, 10),
      to: dateTo.toISOString().slice(0, 10),
      crew: crew.map((c) => `${c.first_name} ${c.last_name} (${c.role})`),
      pairings_priced: priced,
      linked_to: linked ? `${linked.first_name} ${linked.last_name}` : null,
    }
  }

  /**
   * A draft pay run of every accrued line, made as ANOTHER staff member, because a run's creator may not approve it. The
   * signed-in staff member then approves and pays it.
   */
  async draftRun(userId: string): Promise<{ run_id: string; created_by: string; lines: number }> {
    const me = await this.staffOf(userId)
    const creator = await this.db.staff.findFirst({ where: { deleted_at: null, id: { not: me.id } }, orderBy: { created_at: 'asc' } })
    if (!creator) throw new ConflictException('Need a second staff member to create the run. Run npm run db:seed first.')

    const accrued = await this.db.payroll_line.findMany({ where: { status: 'accrued' }, orderBy: { earned_on: 'asc' } })
    if (accrued.length === 0) throw new ConflictException('No accrued pay yet. Add sample crew work first.')
    const periodStart = accrued[0].earned_on
    const periodEnd = new Date()
    periodEnd.setUTCHours(0, 0, 0, 0)

    const run = await this.db.$transaction(async (tx) => {
      const created = await tx.pay_run.create({
        data: { period_start: periodStart, period_end: periodEnd, created_by_staff_id: creator.id },
      })
      await tx.payroll_line.updateMany({
        where: { status: 'accrued', earned_on: { lte: periodEnd } },
        data: { status: 'in_run', pay_run_id: created.id },
      })
      return created
    })
    return { run_id: run.id, created_by: `${creator.first_name} ${creator.last_name}`, lines: accrued.length }
  }

  /**
   * Takes out everything the sample data made: pay, payouts, runs made only of it, the pairings with their flights and
   * rosters, the sample aircraft and the sample crew. The `finance_posting` rows stay (append-only).
   */
  async remove(): Promise<Record<string, number>> {
    const crew = await this.demoCrew()
    const crewIds = crew.map((c) => c.id)
    const aircraft = await this.db.aircraft.findFirst({ where: { tail_number: DEMO_TAIL }, select: { id: true } })
    const flightIds = aircraft
      ? (await this.db.flight.findMany({ where: { aircraft_id: aircraft.id }, select: { id: true } })).map((f) => f.id)
      : []
    const legs = await this.db.pairing_leg.findMany({ where: { flight_id: { in: flightIds } }, select: { pairing_id: true } })
    const pairingIds = [...new Set(legs.map((l) => l.pairing_id))]
    const rosterIds = (
      await this.db.roster_run_pairing.findMany({ where: { pairing_id: { in: pairingIds } }, select: { roster_run_id: true } })
    ).map((r) => r.roster_run_id)
    const runIds = (
      await this.db.payroll_line.findMany({
        where: { crew_id: { in: crewIds }, pay_run_id: { not: null } },
        distinct: ['pay_run_id'],
        select: { pay_run_id: true },
      })
    ).flatMap((l) => (l.pay_run_id ? [l.pay_run_id] : []))

    const removed: Record<string, number> = {}
    await this.db.$transaction(async (tx) => {
      removed.payouts = (await tx.payout.deleteMany({ where: { crew_id: { in: crewIds } } })).count
      removed.payroll_lines = (await tx.payroll_line.deleteMany({ where: { crew_id: { in: crewIds } } })).count
      // A run is removed only when nothing else is left in it (a run that holds other crew's pay is not ours to remove).
      let runs = 0
      for (const id of runIds) {
        const [lines, payouts] = await Promise.all([
          tx.payroll_line.count({ where: { pay_run_id: id } }),
          tx.payout.count({ where: { pay_run_id: id } }),
        ])
        if (lines === 0 && payouts === 0) runs += (await tx.pay_run.deleteMany({ where: { id } })).count
      }
      removed.pay_runs = runs
      removed.assignments = (await tx.pairing_leg_assignment.deleteMany({ where: { pairing_id: { in: pairingIds } } })).count
      removed.legs = (await tx.pairing_leg.deleteMany({ where: { pairing_id: { in: pairingIds } } })).count
      await tx.roster_run_pairing.deleteMany({ where: { pairing_id: { in: pairingIds } } })
      removed.rosters = (await tx.roster_run.deleteMany({ where: { id: { in: rosterIds }, roster_run_pairing: { none: {} } } })).count
      removed.pairings = (await tx.pairing.deleteMany({ where: { id: { in: pairingIds } } })).count
      removed.flights = (await tx.flight.deleteMany({ where: { id: { in: flightIds } } })).count
      removed.aircraft = (await tx.aircraft.deleteMany({ where: { tail_number: DEMO_TAIL } })).count
      removed.aircraft_types = (await tx.aircraft_type.deleteMany({ where: { code: DEMO_TYPE_CODE, aircraft: { none: {} } } })).count
      await tx.crew.updateMany({ where: { id: { in: crewIds } }, data: { staff_id: null } })
      removed.crew = (await tx.crew.deleteMany({ where: { id: { in: crewIds } } })).count
    })
    return removed
  }

  private async ensureCrew(myStaffId: string) {
    const out: NonNullable<Awaited<ReturnType<DbService['crew']['findFirst']>>>[] = []
    for (const c of CREW) {
      const found = await this.db.crew.findFirst({ where: { employee_number: c.employee_number, deleted_at: null } })
      out.push(
        found ??
          (await this.db.crew.create({
            data: {
              ...c,
              base_airport: 'BKK',
              fleet_aircraft_type: 'A320',
              languages: ['th', 'en'],
              licence_number: `LIC-${c.employee_number}`,
              licence_expires_on: new Date('2028-12-31'),
            },
          })),
      )
    }
    const cabin = out[2]
    if (!cabin.staff_id && !(await this.db.crew.findFirst({ where: { staff_id: myStaffId } }))) {
      await this.db.crew.update({ where: { id: cabin.id }, data: { staff_id: myStaffId } })
    }
    return out
  }

  private async demoAircraft() {
    const type =
      (await this.db.aircraft_type.findFirst({ where: { code: DEMO_TYPE_CODE } })) ??
      (await this.db.aircraft_type.create({
        data: {
          code: DEMO_TYPE_CODE,
          manufacturer: 'Airbus',
          model: 'A320 (payments demo)',
          layout: { cabins: [{ cabin: 'economy', rows: [1, 30], seats: 'ABCDEF' }] },
          hold_weight_limit_kg: 9000,
          max_takeoff_weight_kg: 78000,
          max_range_km: 6100,
          min_turnaround_minutes: 45,
          operating_cost_per_hour: '3500.00',
          cost_currency: 'USD',
        },
      }))
    return (
      (await this.db.aircraft.findFirst({ where: { tail_number: DEMO_TAIL } })) ??
      this.db.aircraft.create({
        data: {
          tail_number: DEMO_TAIL,
          aircraft_type_id: type.id,
          entry_into_service_date: new Date('2024-01-01'),
          base_airport_code: 'BKK',
        },
      })
    )
  }
}

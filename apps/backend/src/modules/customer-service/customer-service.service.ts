import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { SimulationClock } from '../admin-console/simulation-clock'
import { FLIGHT_ISSUES, FOOD_ISSUES, type CaseStatus } from './customer-service.constants'
import { CASE_DETAIL_INCLUDE, CASE_INCLUDE, toComplaintDetail, toComplaintView, type ComplaintView } from './complaint.view'
import type { CreateComplaintDto } from './dto/create-complaint.dto'

/** Statuses a staff member may move a case to, from each status. 'with_supervisor' as a target is a reopen. */
const TRANSITIONS: Record<CaseStatus, CaseStatus[]> = {
  with_supervisor: ['assigned'],
  assigned: ['assigned', 'resolved'],
  resolved: ['closed', 'with_supervisor'],
  closed: ['with_supervisor'],
}

const STAFF_LIST_LIMIT = 500

@Injectable()
export class CustomerServiceService {
  constructor(
    private readonly db: DbService,
    private readonly clock: SimulationClock,
  ) {}

  // ── Customer ─────────────────────────────────────────────────────────────

  async create(userId: string, email: string, dto: CreateComplaintDto): Promise<ComplaintView> {
    const customer = await this.customerFor(userId)

    let flightId: string | null = null
    if (dto.type !== 'employee') {
      const issues: readonly string[] = dto.type === 'flight' ? FLIGHT_ISSUES : FOOD_ISSUES
      if (!dto.issue || !issues.includes(dto.issue)) {
        throw new BadRequestException(`issue must be one of: ${issues.join(', ')}`)
      }
      // Spaces ignored on both sides: the DTO strips them, and flight numbers are stored as 'FY 204' as well as 'FY204'.
      const [flight] = await this.db.$queryRaw<{ id: string }[]>`
        SELECT id FROM flight
        WHERE replace(upper(flight_number), ' ', '') = ${dto.flight_number} AND service_date = ${dto.service_date}::date
        LIMIT 1`
      if (!flight) throw new NotFoundException(`No flight ${dto.flight_number} on ${dto.service_date}`)
      flightId = flight.id
    }

    const now = this.clock.now()
    const caseNumber = await this.db.$transaction(async (tx) => {
      // complaint_case_seq is the migration's counter; the year comes from the simulation clock.
      const [{ n }] = await tx.$queryRaw<{ n: bigint }[]>`SELECT nextval('complaint_case_seq') AS n`
      const case_number = `CS-${now.getUTCFullYear()}-${String(n).padStart(6, '0')}`
      const row = await tx.complaint_case.create({
        data: {
          case_number,
          type: dto.type,
          passenger_id: customer.passenger_id,
          customer_id: customer.id,
          contact_email: email,
          opened_at: now,
        },
        select: { id: true },
      })
      if (dto.type === 'employee') {
        await tx.employee_complaint.create({
          data: { case_id: row.id, location: dto.location!, staff_name: dto.staff_name || null, description: dto.description },
        })
      } else if (dto.type === 'flight') {
        await tx.flight_complaint.create({ data: { case_id: row.id, flight_id: flightId!, issue: dto.issue!, details: dto.description } })
      } else {
        await tx.food_complaint.create({ data: { case_id: row.id, flight_id: flightId!, issue: dto.issue!, details: dto.description } })
      }
      await tx.case_event.create({ data: { case_id: row.id, event_type: 'created', actor_type: 'complainant', occurred_at: now } })
      return case_number
    })

    return this.getForCustomer(userId, caseNumber)
  }

  async listForCustomer(userId: string): Promise<ComplaintView[]> {
    const customer = await this.customerFor(userId)
    const rows = await this.db.complaint_case.findMany({
      where: { customer_id: customer.id },
      include: CASE_INCLUDE,
      orderBy: { opened_at: 'desc' },
    })
    return rows.map((row) => ({ ...toComplaintView(row), ownerName: null }))
  }

  /** Only the caller's own cases: someone else's case number is a 404, not a 403, so it reveals nothing. */
  async getForCustomer(userId: string, caseNumber: string): Promise<ComplaintView> {
    const customer = await this.customerFor(userId)
    const row = await this.db.complaint_case.findFirst({
      where: { case_number: caseNumber.trim().toUpperCase(), customer_id: customer.id },
      include: CASE_DETAIL_INCLUDE,
    })
    if (!row) throw new NotFoundException(`Case ${caseNumber} not found`)
    return toComplaintDetail(row, 'customer')
  }

  // ── Staff ────────────────────────────────────────────────────────────────

  async listForStaff(userId: string): Promise<ComplaintView[]> {
    await this.staffIdFor(userId)
    const rows = await this.db.complaint_case.findMany({ include: CASE_INCLUDE, orderBy: { opened_at: 'desc' }, take: STAFF_LIST_LIMIT })
    return rows.map(toComplaintView)
  }

  async getForStaff(userId: string, id: string): Promise<ComplaintView> {
    await this.staffIdFor(userId)
    return this.staffDetail(id)
  }

  /**
   * Moves a case along with_supervisor → assigned → resolved → closed. 'assigned' assigns it to the caller;
   * 'with_supervisor' reopens a resolved or closed case and clears its owner and resolution.
   */
  async setStatus(userId: string, id: string, status: CaseStatus): Promise<ComplaintView> {
    const staffId = await this.staffIdFor(userId)
    const current = await this.db.complaint_case.findUnique({ where: { id }, select: { status: true, owner_staff_id: true } })
    if (!current) throw new NotFoundException(`Case ${id} not found`)
    const from = current.status as CaseStatus
    if (!TRANSITIONS[from].includes(status) || (status === 'assigned' && current.owner_staff_id === staffId)) {
      throw new ConflictException(`A ${from} case cannot be moved to ${status}`)
    }

    const now = this.clock.now()
    const changes = {
      assigned: { owner_staff_id: staffId },
      resolved: { resolved_at: now },
      closed: { closed_at: now },
      with_supervisor: { owner_staff_id: null, resolved_at: null, closed_at: null },
    }[status]
    const eventType = { assigned: 'assigned', resolved: 'status_changed', closed: 'closed', with_supervisor: 'reopened' }[status]

    await this.db.$transaction(async (tx) => {
      // Guarded on the status we read, so two staff acting at once cannot both win.
      const { count } = await tx.complaint_case.updateMany({
        where: { id, status: from },
        data: { status, ...changes, updated_at: new Date() },
      })
      if (count === 0) throw new ConflictException('The case changed while you were editing it. Reload and try again.')
      await tx.case_event.create({
        data: {
          case_id: id,
          event_type: eventType,
          actor_type: 'staff',
          actor_staff_id: staffId,
          from_value: from,
          to_value: status,
          occurred_at: now,
        },
      })
    })
    return this.staffDetail(id)
  }

  /** Staff notes are always internal (the migration's CHECK on note_added). */
  async addNote(userId: string, id: string, note: string): Promise<ComplaintView> {
    const staffId = await this.staffIdFor(userId)
    const exists = await this.db.complaint_case.findUnique({ where: { id }, select: { id: true } })
    if (!exists) throw new NotFoundException(`Case ${id} not found`)
    const now = this.clock.now()
    await this.db.$transaction([
      this.db.case_event.create({
        data: {
          case_id: id,
          event_type: 'note_added',
          actor_type: 'staff',
          actor_staff_id: staffId,
          note,
          is_internal: true,
          occurred_at: now,
        },
      }),
      this.db.complaint_case.update({ where: { id }, data: { updated_at: new Date() } }),
    ])
    return this.staffDetail(id)
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private async staffDetail(id: string): Promise<ComplaintView> {
    const row = await this.db.complaint_case.findUnique({ where: { id }, include: CASE_DETAIL_INCLUDE })
    if (!row) throw new NotFoundException(`Case ${id} not found`)
    return toComplaintDetail(row, 'staff')
  }

  private async customerFor(userId: string) {
    const customer = await this.db.customer.findFirst({
      where: { user_id: userId, deleted_at: null },
      select: { id: true, passenger_id: true },
    })
    if (!customer) throw new ForbiddenException('Only customer accounts can use this')
    return customer
  }

  private async staffIdFor(userId: string): Promise<string> {
    const staff = await this.db.staff.findFirst({ where: { user_id: userId, deleted_at: null }, select: { id: true } })
    if (!staff) throw new ForbiddenException('Only staff members can use this')
    return staff.id
  }
}

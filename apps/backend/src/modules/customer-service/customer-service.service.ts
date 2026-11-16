import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { SimulationClock } from '../admin-console/simulation-clock'
import { AuditService } from '../admin-console/audit/audit.service'
import { FLIGHT_ISSUES, FOOD_ISSUES, type CaseStatus } from './customer-service.constants'
import { CASE_DETAIL_INCLUDE, CASE_INCLUDE, toComplaintDetail, toComplaintView, type ComplaintView } from './complaint.view'
import type { CreateComplaintDto, CreateGuestComplaintDto } from './dto/create-complaint.dto'
import type { DecideCompensationDto, UpdateNotificationTemplateDto } from './dto/staff-actions.dto'

/**
 * Statuses a staff member may move a case to through PATCH :id/status, from each status.
 * Owners are set only by the supervisor through PATCH :id/assign, and only the complainant reopens.
 */
const TRANSITIONS: Record<CaseStatus, CaseStatus[]> = {
  with_supervisor: [],
  assigned: ['resolved'],
  resolved: ['closed'],
  closed: [],
}

const STAFF_LIST_LIMIT = 500
const DELIVERY_LOG_LIMIT = 200
const WEEKS_IN_CHART = 8
const DAY_MS = 24 * 60 * 60 * 1000
const WEEK_MS = 7 * DAY_MS
const REOPEN_WINDOW_MS = 7 * DAY_MS
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "12 Oct", in UTC. */
function dayMonthLabel(d: Date): string {
  return `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]}`
}

/** Midnight UTC on the Monday of d's week. */
function startOfUtcWeek(d: Date): Date {
  const daysSinceMonday = (d.getUTCDay() + 6) % 7
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - daysSinceMonday * DAY_MS)
}

export interface StaffChartsResponse {
  totalComplaints: number
  openNow: number
  withSupervisorCount: number
  assignedCount: number
  resolvedCount: number
  closedCount: number
  avgDaysToClose: string
  compensationTotalThb: number
  compensationDecisions: number
  compensationFailed: number
  byType: {
    employee: number
    flight: number
    food: number
  }
  topFlights: {
    flight: string
    date: string
    route: string
    type: 'Employee' | 'Flight' | 'Food'
    cases: number
  }[]
  weeklyData: {
    week: string
    count: number
    latest: boolean
  }[]
}

export interface DeliveryLogRowView {
  id: string
  eventId: string
  time: string
  dateLabel: string
  occurredAt: string
  event: string
  typeCode: string
  feature: string
  recipient: string
  channel: 'Email' | 'SMS' | 'Push'
  status: 'Sent' | 'Sent on retry' | 'Failed · retrying' | 'Queued'
  linkedTo: string
  linkedIsCase: boolean
  tries: number
  subject: string | null
  body: string | null
  error: string | null
}

export interface StaffDeliveryLogResponse {
  kpis: {
    eventsReceived: number
    messagesSent: number
    failedRetrying: number
    duplicateIgnored: number
  }
  rows: DeliveryLogRowView[]
}

export interface StaffTemplateItemView {
  code: string
  name: string
  feature: string
  group: 'ALWAYS SENT' | 'OPTIONAL'
  emailState: '✓' | '–' | '!' | ' '
  smsState: '✓' | '–' | '!' | ' '
  pushState: '✓' | '–' | '!' | ' '
  emailTitle?: string
  emailBody?: string
  smsBody?: string
  pushTitle?: string
  pushBody?: string
}

@Injectable()
export class CustomerServiceService {
  private readonly logger = new Logger(CustomerServiceService.name)

  constructor(
    private readonly db: DbService,
    private readonly clock: SimulationClock,
    @Optional() private readonly audit?: AuditService,
  ) {}

  // ── Customer (Signed-In Account) ─────────────────────────────────────────

  async create(userId: string, email: string, dto: CreateComplaintDto): Promise<ComplaintView> {
    const customer = await this.customerFor(userId)

    let flightId: string | null = null
    if (dto.type !== 'employee') {
      const issues: readonly string[] = dto.type === 'flight' ? FLIGHT_ISSUES : FOOD_ISSUES
      if (!dto.issue || !issues.includes(dto.issue)) {
        throw new BadRequestException(`issue must be one of: ${issues.join(', ')}`)
      }

      const [flight] = await this.db.$queryRaw<{ id: string }[]>`
        SELECT id FROM flight
        WHERE replace(upper(flight_number), ' ', '') = ${dto.flight_number} AND service_date = ${dto.service_date}::date
        LIMIT 1`
      if (!flight) throw new NotFoundException(`No flight ${dto.flight_number} on ${dto.service_date}`)
      flightId = flight.id

      // The flight must be on one of this customer's own bookings (and on the given booking, when one is named).
      // "Own" means they made the booking or travel on it as a passenger.
      const bookingReference = dto.booking_reference?.trim().toUpperCase()
      const seg = await this.db.booking_segment.findFirst({
        where: {
          flight_id: flight.id,
          booking: {
            ...(bookingReference ? { booking_reference: bookingReference } : {}),
            OR: [{ customer_id: customer.id }, { booking_passenger: { some: { passenger_id: customer.passenger_id } } }],
          },
        },
        select: { id: true },
      })
      if (!seg) throw new BadRequestException('FLIGHT_NOT_ON_BOOKING')
    }

    const now = this.clock.now()
    const caseNumber = await this.db.$transaction(async (tx) => {
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

  async getForCustomer(userId: string, caseNumber: string): Promise<ComplaintView> {
    const customer = await this.customerFor(userId)
    const normalized = caseNumber.trim().toUpperCase()
    const row = await this.db.complaint_case.findFirst({
      where: { case_number: normalized, customer_id: customer.id },
      include: CASE_DETAIL_INCLUDE,
    })
    if (!row) throw new NotFoundException(`Case ${caseNumber} not found`)
    return toComplaintDetail(row, 'customer')
  }

  async reopenForCustomer(userId: string, caseNumber: string): Promise<ComplaintView> {
    const customer = await this.customerFor(userId)
    const normalized = caseNumber.trim().toUpperCase()
    const row = await this.db.complaint_case.findFirst({
      where: { case_number: normalized, customer_id: customer.id },
      select: { id: true, status: true, closed_at: true },
    })
    if (!row) throw new NotFoundException(`Case ${caseNumber} not found`)

    // Only a closed case reopens, and only within 7 days of closing.
    if (row.status !== 'closed') {
      throw new ConflictException('INVALID_STATUS')
    }

    const now = this.clock.now()
    if (!row.closed_at || now.getTime() - row.closed_at.getTime() > REOPEN_WINDOW_MS) {
      throw new ConflictException('CANNOT_REOPEN_AFTER_7_DAYS')
    }

    await this.db.$transaction(async (tx) => {
      const { count } = await tx.complaint_case.updateMany({
        where: { id: row.id, status: row.status },
        data: {
          status: 'with_supervisor',
          owner_staff_id: null,
          resolved_at: null,
          closed_at: null,
          updated_at: new Date(),
        },
      })
      if (count === 0) throw new ConflictException('The case changed while you were editing it.')
      await tx.case_event.create({
        data: {
          case_id: row.id,
          event_type: 'reopened',
          actor_type: 'complainant',
          from_value: row.status,
          to_value: 'with_supervisor',
          occurred_at: now,
        },
      })
    })

    return this.getForCustomer(userId, caseNumber)
  }

  // ── Customer (Guest / Passenger without an account) ─────────────────────

  async createGuest(dto: CreateGuestComplaintDto): Promise<ComplaintView> {
    const bookingReference = dto.booking_reference?.trim().toUpperCase()
    const surname = dto.surname?.trim()

    if (!bookingReference || !surname) {
      throw new BadRequestException('Booking reference and surname are required')
    }

    const bp = await this.db.booking_passenger.findFirst({
      where: {
        booking: { booking_reference: bookingReference },
        passenger: { last_name: { equals: surname, mode: 'insensitive' }, deleted_at: null },
      },
      include: {
        passenger: true,
        booking: {
          include: {
            booking_segment: { select: { flight_id: true } },
          },
        },
      },
    })

    if (!bp) {
      throw new NotFoundException('BOOKING_NOT_FOUND')
    }

    let flightId: string | null = null
    if (dto.type !== 'employee') {
      const issues: readonly string[] = dto.type === 'flight' ? FLIGHT_ISSUES : FOOD_ISSUES
      if (!dto.issue || !issues.includes(dto.issue)) {
        throw new BadRequestException(`issue must be one of: ${issues.join(', ')}`)
      }

      const [flight] = await this.db.$queryRaw<{ id: string }[]>`
        SELECT id FROM flight
        WHERE replace(upper(flight_number), ' ', '') = ${dto.flight_number} AND service_date = ${dto.service_date}::date
        LIMIT 1`
      if (!flight) throw new NotFoundException(`No flight ${dto.flight_number} on ${dto.service_date}`)
      flightId = flight.id

      const hasSegment = bp.booking?.booking_segment?.some((s) => s.flight_id === flight.id)
      if (!hasSegment) {
        throw new BadRequestException('FLIGHT_NOT_ON_BOOKING')
      }
    }

    const contactEmail = dto.contact_email?.trim() || bp.booking?.contact_email || null
    const contactPhone = dto.contact_phone?.trim() || bp.booking?.contact_phone || null
    if (!contactEmail && !contactPhone) {
      throw new BadRequestException('Contact email or phone number is required')
    }

    const now = this.clock.now()
    const caseNumber = await this.db.$transaction(async (tx) => {
      const [{ n }] = await tx.$queryRaw<{ n: bigint }[]>`SELECT nextval('complaint_case_seq') AS n`
      const case_number = `CS-${now.getUTCFullYear()}-${String(n).padStart(6, '0')}`
      const row = await tx.complaint_case.create({
        data: {
          case_number,
          type: dto.type,
          passenger_id: bp.passenger_id,
          customer_id: null,
          booking_passenger_id: bp.id,
          contact_email: contactEmail,
          contact_phone: contactPhone,
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

    return this.getGuestCase(caseNumber, bookingReference, surname)
  }

  async getGuestCase(caseNumber: string, bookingReference: string, surname: string): Promise<ComplaintView> {
    const normalizedCase = caseNumber.trim().toUpperCase()
    const normalizedRef = bookingReference.trim().toUpperCase()
    const normalizedSurname = surname.trim()

    const row = await this.db.complaint_case.findFirst({
      where: {
        case_number: normalizedCase,
        booking_passenger: {
          booking: { booking_reference: normalizedRef },
          passenger: { last_name: { equals: normalizedSurname, mode: 'insensitive' } },
        },
      },
      include: CASE_DETAIL_INCLUDE,
    })

    if (!row) {
      throw new NotFoundException(`Case ${caseNumber} not found for this booking`)
    }

    return toComplaintDetail(row, 'customer')
  }

  // ── Staff ────────────────────────────────────────────────────────────────

  async listForStaff(userId: string): Promise<ComplaintView[]> {
    await this.staffIdFor(userId)
    const rows = await this.db.complaint_case.findMany({
      include: CASE_INCLUDE,
      orderBy: { opened_at: 'desc' },
      take: STAFF_LIST_LIMIT,
    })
    return rows.map(toComplaintView)
  }

  async getForStaff(userId: string, id: string): Promise<ComplaintView> {
    await this.staffIdFor(userId)
    return this.staffDetail(id)
  }

  async getCurrentStaff(userId: string) {
    const staff = await this.db.staff.findFirst({
      where: { user_id: userId, deleted_at: null },
      include: { role: true },
    })
    if (!staff) throw new ForbiddenException('Staff account required')
    return {
      id: staff.id,
      name: `${staff.first_name} ${staff.last_name}`,
      roleCode: staff.role.code,
      roleName: staff.role.name,
      isSupervisor: staff.role.code === 'cs-supervisor' || staff.role.is_admin === true,
    }
  }

  async getStaffMembers() {
    const staff = await this.db.staff.findMany({
      where: {
        deleted_at: null,
        role: { code: { in: ['cs-agent', 'cs-supervisor'] } },
      },
      select: {
        id: true,
        first_name: true,
        last_name: true,
        role: { select: { code: true, name: true } },
      },
      orderBy: [{ role: { code: 'desc' } }, { first_name: 'asc' }],
    })
    return staff.map((s) => ({
      id: s.id,
      name: `${s.first_name} ${s.last_name}`,
      roleCode: s.role.code,
      roleName: s.role.name,
    }))
  }

  async assignOwner(userId: string, id: string, targetStaffId: string): Promise<ComplaintView> {
    const callerStaffId = await this.staffIdFor(userId)
    const targetStaff = await this.db.staff.findFirst({
      where: { id: targetStaffId, deleted_at: null },
      select: { id: true, first_name: true, last_name: true },
    })
    if (!targetStaff) throw new NotFoundException(`Staff ${targetStaffId} not found`)

    const current = await this.db.complaint_case.findUnique({
      where: { id },
      select: { status: true, owner_staff_id: true, case_number: true },
    })
    if (!current) throw new NotFoundException(`Case ${id} not found`)

    const from = current.status as CaseStatus
    if (from === 'resolved' || from === 'closed') {
      throw new ConflictException('INVALID_STATUS')
    }

    const now = this.clock.now()
    await this.db.$transaction(async (tx) => {
      const { count } = await tx.complaint_case.updateMany({
        where: { id, status: from },
        data: { status: 'assigned', owner_staff_id: targetStaffId, updated_at: new Date() },
      })
      if (count === 0) throw new ConflictException('The case changed while you were editing it.')

      await tx.case_event.create({
        data: {
          case_id: id,
          event_type: 'assigned',
          actor_type: 'staff',
          actor_staff_id: callerStaffId,
          from_value: from,
          to_value: 'assigned',
          note: `Assigned to ${targetStaff.first_name} ${targetStaff.last_name}`,
          occurred_at: now,
        },
      })

      if (this.audit) {
        const actor = await this.audit.resolveActor(userId)
        await this.audit.write(
          {
            actor,
            sourceFeature: '13',
            action: 'update',
            entityType: 'complaint_case',
            entityId: id,
            summary: `Assigned case ${current.case_number} to staff ${targetStaff.first_name} ${targetStaff.last_name}`,
          },
          tx,
        )
      }
    })

    return this.staffDetail(id)
  }

  async setStatus(userId: string, id: string, status: CaseStatus, resolutionNote?: string): Promise<ComplaintView> {
    const staff = await this.staffFor(userId)
    const staffId = staff.id
    const current = await this.db.complaint_case.findUnique({
      where: { id },
      select: { status: true, owner_staff_id: true, case_number: true },
    })
    if (!current) throw new NotFoundException(`Case ${id} not found`)
    // An agent works only the cases assigned to them; the supervisor may act on any case.
    if (!staff.isSupervisor && current.owner_staff_id !== staffId) {
      throw new ForbiddenException('NOT_CASE_OWNER')
    }
    const from = current.status as CaseStatus
    if (!TRANSITIONS[from]?.includes(status) || (status !== 'resolved' && status !== 'closed')) {
      throw new ConflictException(`A ${from} case cannot be moved to ${status}`)
    }

    const now = this.clock.now()
    const changes = status === 'resolved' ? { resolved_at: now } : { closed_at: now }
    const eventType = status === 'resolved' ? 'status_changed' : 'closed'

    await this.db.$transaction(async (tx) => {
      const { count } = await tx.complaint_case.updateMany({
        // owner_staff_id in the filter so a reassignment between the read and this write is a conflict, not a stale-owner write
        where: { id, status: from, owner_staff_id: current.owner_staff_id },
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
          note: resolutionNote || null,
          occurred_at: now,
        },
      })

      if (this.audit) {
        const actor = await this.audit.resolveActor(userId)
        await this.audit.write(
          {
            actor,
            sourceFeature: '13',
            action: 'update',
            entityType: 'complaint_case',
            entityId: id,
            summary: `Updated case ${current.case_number} status from ${from} to ${status}`,
          },
          tx,
        )
      }
    })

    return this.staffDetail(id)
  }

  async addNote(userId: string, id: string, note: string): Promise<ComplaintView> {
    const staffId = await this.staffIdFor(userId)
    const current = await this.db.complaint_case.findUnique({ where: { id }, select: { id: true, case_number: true } })
    if (!current) throw new NotFoundException(`Case ${id} not found`)
    const now = this.clock.now()

    await this.db.$transaction(async (tx) => {
      const event = await tx.case_event.create({
        data: {
          case_id: id,
          event_type: 'note_added',
          actor_type: 'staff',
          actor_staff_id: staffId,
          note,
          is_internal: true,
          occurred_at: now,
        },
        select: { id: true },
      })
      await tx.complaint_case.update({ where: { id }, data: { updated_at: new Date() } })

      if (this.audit) {
        const actor = await this.audit.resolveActor(userId)
        await this.audit.write(
          {
            actor,
            sourceFeature: '13',
            action: 'create',
            entityType: 'case_event',
            entityId: event.id,
            summary: `Added internal note to case ${current.case_number}`,
          },
          tx,
        )
      }
    })

    return this.staffDetail(id)
  }

  async decideCompensation(userId: string, id: string, dto: DecideCompensationDto): Promise<ComplaintView> {
    const staffId = await this.staffIdFor(userId)
    const current = await this.db.complaint_case.findUnique({ where: { id }, select: { id: true, case_number: true } })
    if (!current) throw new NotFoundException(`Case ${id} not found`)

    const now = this.clock.now()
    await this.db.$transaction(async (tx) => {
      const existingComp = await tx.case_compensation.findFirst({
        where: { case_id: id, status: { not: 'failed' } },
      })
      if (existingComp) {
        throw new ConflictException('COMPENSATION_EXISTS')
      }

      const comp = await tx.case_compensation.create({
        data: {
          case_id: id,
          decided_by_staff_id: staffId,
          type: dto.type,
          amount: dto.amount,
          reason: dto.reason,
          status: 'pending',
          decided_at: now,
        },
      })

      await tx.case_event.create({
        data: {
          case_id: id,
          event_type: 'compensation_decided',
          actor_type: 'staff',
          actor_staff_id: staffId,
          to_value: `${dto.type}: ${dto.amount}`,
          note: dto.reason,
          occurred_at: now,
        },
      })

      if (this.audit) {
        const actor = await this.audit.resolveActor(userId)
        await this.audit.write(
          {
            actor,
            sourceFeature: '13',
            action: 'create',
            entityType: 'case_compensation',
            entityId: comp.id,
            summary: `Decided compensation ${dto.type} ${dto.amount} for case ${current.case_number}`,
          },
          tx,
        )
      }
    })

    return this.staffDetail(id)
  }

  // ── Analytics, Delivery Log, Templates ─────────────────────────────────────

  async getChartsForStaff(userId: string): Promise<StaffChartsResponse> {
    await this.staffIdFor(userId)
    const cases = await this.db.complaint_case.findMany({
      include: {
        case_compensation: true,
        flight_complaint: { include: { flight: { include: { route: true } } } },
        food_complaint: { include: { flight: { include: { route: true } } } },
        employee_complaint: true,
      },
    })

    const withSupervisorCount = cases.filter((c) => c.status === 'with_supervisor').length
    const assignedCount = cases.filter((c) => c.status === 'assigned').length
    const resolvedCount = cases.filter((c) => c.status === 'resolved').length
    const closedCount = cases.filter((c) => c.status === 'closed').length
    const totalComplaints = cases.length
    const openNow = withSupervisorCount + assignedCount

    let totalDays = 0
    let closedCountForAvg = 0
    for (const c of cases) {
      if ((c.status === 'resolved' || c.status === 'closed') && (c.resolved_at || c.closed_at)) {
        const end = (c.closed_at ?? c.resolved_at)!.getTime()
        const start = c.opened_at.getTime()
        const diffDays = Math.max(0.1, (end - start) / (1000 * 60 * 60 * 24))
        totalDays += diffDays
        closedCountForAvg++
      }
    }
    // Just the number (the page adds "days"), or '–' when no case has been resolved or closed yet.
    const avgDaysToClose = closedCountForAvg > 0 ? (totalDays / closedCountForAvg).toFixed(1) : '–'

    let compensationTotalThb = 0
    let compensationDecisions = 0
    let compensationFailed = 0
    for (const c of cases) {
      for (const comp of c.case_compensation) {
        compensationDecisions++
        if (comp.status === 'failed') compensationFailed++
        else compensationTotalThb += Number(comp.amount) || 0
      }
    }

    const byType = {
      employee: cases.filter((c) => c.type === 'employee').length,
      flight: cases.filter((c) => c.type === 'flight').length,
      food: cases.filter((c) => c.type === 'food').length,
    }

    const flightStats = new Map<
      string,
      { flight: string; count: number; date: string; route: string; type: 'Employee' | 'Flight' | 'Food' }
    >()
    for (const c of cases) {
      const fl = c.flight_complaint?.flight || c.food_complaint?.flight
      if (fl) {
        // One row per operated flight (number + date), so FY308 on two days counts separately.
        const prev = flightStats.get(fl.id)
        flightStats.set(fl.id, {
          flight: fl.flight_number,
          count: (prev?.count ?? 0) + 1,
          date: prev?.date ?? dayMonthLabel(fl.service_date),
          route: prev?.route ?? `${fl.route.origin} → ${fl.route.destination}`,
          type: prev?.type ?? (c.type === 'food' ? 'Food' : 'Flight'),
        })
      }
    }

    const topFlights = Array.from(flightStats.values())
      .map((val) => ({
        flight: val.flight,
        date: val.date,
        route: val.route,
        type: val.type,
        cases: val.count,
      }))
      .sort((a, b) => b.cases - a.cases)
      .slice(0, 5)

    // The last WEEKS_IN_CHART weeks (Monday to Sunday, UTC) up to the current one, counted by opened_at.
    const thisWeekStart = startOfUtcWeek(this.clock.now())
    const weeklyData = Array.from({ length: WEEKS_IN_CHART }, (_, i) => {
      const start = new Date(thisWeekStart.getTime() - (WEEKS_IN_CHART - 1 - i) * WEEK_MS)
      const end = start.getTime() + WEEK_MS
      const count = cases.filter((c) => c.opened_at.getTime() >= start.getTime() && c.opened_at.getTime() < end).length
      return { week: dayMonthLabel(start), count, latest: i === WEEKS_IN_CHART - 1 }
    })

    return {
      totalComplaints,
      openNow,
      withSupervisorCount,
      assignedCount,
      resolvedCount,
      closedCount,
      avgDaysToClose,
      compensationTotalThb,
      compensationDecisions,
      compensationFailed,
      byType,
      topFlights,
      weeklyData,
    }
  }

  async getDeliveryLogForStaff(userId: string): Promise<StaffDeliveryLogResponse> {
    await this.staffIdFor(userId)
    const notifs = await this.db.notification.findMany({
      include: {
        notification_type: true,
        complaint_case: { select: { case_number: true } },
      },
      orderBy: { created_at: 'desc' },
      take: DELIVERY_LOG_LIMIT,
    })

    const rows: DeliveryLogRowView[] = notifs.map((n) => {
      const dateObj = n.sent_at || n.created_at
      const timeStr = `${String(dateObj.getUTCHours()).padStart(2, '0')}:${String(dateObj.getUTCMinutes()).padStart(2, '0')}`
      const dateLabel = dayMonthLabel(dateObj)
      const occurredAt = `${dateLabel} ${timeStr}`

      let channel: 'Email' | 'SMS' | 'Push' = 'Email'
      if (n.channel === 'sms') channel = 'SMS'
      if (n.channel === 'push') channel = 'Push'

      let status: 'Sent' | 'Sent on retry' | 'Failed · retrying' | 'Queued' = 'Sent'
      if (n.status === 'sent' && (n.attempts ?? 1) > 1) status = 'Sent on retry'
      else if (n.status === 'failed') status = 'Failed · retrying'
      else if (n.status === 'queued') status = 'Queued'

      return {
        id: n.id,
        eventId: n.inbound_event_id,
        time: timeStr,
        dateLabel,
        occurredAt,
        event: n.notification_type?.name ?? n.type_code,
        typeCode: n.type_code,
        feature: 'Feature 13',
        recipient: n.recipient,
        channel,
        status,
        linkedTo: n.complaint_case?.case_number ?? '–',
        linkedIsCase: n.complaint_case !== null,
        tries: n.attempts ?? 1,
        subject: n.subject,
        body: n.body,
        error: n.error,
      }
    })

    return {
      kpis: {
        // Counted over the rows shown (latest DELIVERY_LOG_LIMIT messages).
        eventsReceived: new Set(notifs.map((n) => n.inbound_event_id)).size,
        messagesSent: notifs.filter((n) => n.status === 'sent').length,
        failedRetrying: notifs.filter((n) => n.status === 'failed').length,
        // Duplicate inbound events are rejected by inbound_event's unique key and never stored, so there is nothing to count yet.
        duplicateIgnored: 0,
      },
      rows,
    }
  }

  async getTemplatesForStaff(userId: string): Promise<StaffTemplateItemView[]> {
    await this.staffIdFor(userId)
    const types = await this.db.notification_type.findMany({
      include: { notification_template: true },
      orderBy: { code: 'asc' },
    })

    return types.map((t) => {
      const email = t.notification_template.find((tmp) => tmp.channel === 'email')
      const sms = t.notification_template.find((tmp) => tmp.channel === 'sms')
      const push = t.notification_template.find((tmp) => tmp.channel === 'push')

      const emailState = email ? (email.is_active ? '✓' : '!') : '–'
      const smsState = sms ? (sms.is_active ? '✓' : '!') : '–'
      const pushState = push ? (push.is_active ? '✓' : '!') : '–'

      return {
        code: t.code,
        name: t.name,
        feature: 'Feature 13',
        group: t.is_mandatory ? 'ALWAYS SENT' : 'OPTIONAL',
        emailState,
        smsState,
        pushState,
        emailTitle: email?.subject_template ?? undefined,
        emailBody: email?.body_template ?? undefined,
        smsBody: sms?.body_template ?? undefined,
        pushTitle: push?.subject_template ?? undefined,
        pushBody: push?.body_template ?? undefined,
      }
    })
  }

  async updateTemplateForStaff(userId: string, code: string, dto: UpdateNotificationTemplateDto) {
    await this.staffIdFor(userId)
    const type = await this.db.notification_type.findUnique({ where: { code } })
    if (!type) throw new NotFoundException(`Notification type ${code} not found`)

    await this.db.$transaction(async (tx) => {
      const existing = await tx.notification_template.findUnique({
        where: { type_code_channel: { type_code: code, channel: dto.channel } },
      })

      const template = existing
        ? await tx.notification_template.update({
            where: { id: existing.id },
            data: {
              is_active: dto.isActive ?? existing.is_active,
              subject_template: dto.subjectTemplate ?? existing.subject_template,
              body_template: dto.bodyTemplate ?? existing.body_template,
            },
            select: { id: true },
          })
        : await tx.notification_template.create({
            data: {
              type_code: code,
              channel: dto.channel,
              is_active: dto.isActive ?? true,
              subject_template: dto.subjectTemplate ?? null,
              body_template: dto.bodyTemplate ?? '',
            },
            select: { id: true },
          })

      if (this.audit) {
        const actor = await this.audit.resolveActor(userId)
        await this.audit.write(
          {
            actor,
            sourceFeature: '13',
            action: 'update',
            entityType: 'notification_template',
            entityId: template.id,
            summary: `Updated notification template ${code} for channel ${dto.channel}`,
          },
          tx,
        )
      }
    })

    return this.getTemplatesForStaff(userId)
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

  /** Same supervisor rule as CustomerServiceStaffGuard and getCurrentStaff: cs-supervisor or an admin role. */
  private async staffFor(userId: string): Promise<{ id: string; isSupervisor: boolean }> {
    const staff = await this.db.staff.findFirst({
      where: { user_id: userId, deleted_at: null },
      select: { id: true, role: { select: { code: true, is_admin: true } } },
    })
    if (!staff) throw new ForbiddenException('Only staff members can use this')
    return { id: staff.id, isSupervisor: staff.role.code === 'cs-supervisor' || staff.role.is_admin === true }
  }

  private async staffIdFor(userId: string): Promise<string> {
    const staff = await this.db.staff.findFirst({
      where: { user_id: userId, deleted_at: null },
      select: { id: true },
    })
    if (!staff) throw new ForbiddenException('Only staff members can use this')
    return staff.id
  }
}

import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { SimulationClock } from '../admin-console/simulation-clock'
import { AuditService } from '../admin-console/audit/audit.service'
import { FLIGHT_ISSUES, FOOD_ISSUES, type CaseStatus } from './customer-service.constants'
import { CASE_DETAIL_INCLUDE, CASE_INCLUDE, toComplaintDetail, toComplaintView, type ComplaintView } from './complaint.view'
import type { CreateComplaintDto } from './dto/create-complaint.dto'
import type { DecideCompensationDto, UpdateNotificationTemplateDto } from './dto/staff-actions.dto'
import { placeholdersFor, unknownPlaceholders } from './notification-placeholders'
import type { InboundEventInput } from './notification-events'
import { NotificationService } from './notification.service'
import type { NotificationPreferenceView, UpdateNotificationPreferencesDto } from './dto/preferences.dto'

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

/** notification_type.source_feature ('2', '13', …) as the page shows it. */
function featureLabel(sourceFeature: string): string {
  return `Feature ${sourceFeature}`
}

/** ✓ = template on, – = template switched off, ! = no template for that channel yet. */
function channelState(template: { is_active: boolean } | undefined): '✓' | '–' | '!' {
  if (!template) return '!'
  return template.is_active ? '✓' : '–'
}

/**
 * The subject and body a template will hold after an update: the new text where the request sends it, else the saved text.
 * Throws 400 when email has no subject, any channel has no body, SMS gets a subject, or a placeholder is not allowed for the type.
 */
function templateText(
  typeCode: string,
  dto: UpdateNotificationTemplateDto,
  existing: { subject_template: string | null; body_template: string } | null,
): { subject: string | null; body: string } {
  const body = dto.bodyTemplate ?? existing?.body_template ?? ''
  let subject = dto.subjectTemplate ?? existing?.subject_template ?? null
  if (dto.channel === 'sms') {
    if (subject) throw new BadRequestException('SMS_HAS_NO_SUBJECT')
    subject = null
  }
  // A push title is optional, so an empty one is stored as no title.
  if (dto.channel === 'push' && !subject?.trim()) subject = null
  if (dto.channel === 'email' && !subject?.trim()) throw new BadRequestException('EMAIL_SUBJECT_REQUIRED')
  if (!body.trim()) throw new BadRequestException('TEMPLATE_BODY_REQUIRED')

  const unknown = unknownPlaceholders(typeCode, `${subject ?? ''}\n${body}`)
  if (unknown.length > 0) {
    throw new BadRequestException({
      statusCode: 400,
      error: 'Bad Request',
      message: 'INVALID_PLACEHOLDER',
      placeholders: unknown,
      allowed: placeholdersFor(typeCode),
    })
  }
  return { subject, body }
}

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
  /** The {{names}} templates of this type may use. */
  placeholders: readonly string[]
  emailState: '✓' | '–' | '!' | ' '
  smsState: '✓' | '–' | '!' | ' '
  pushState: '✓' | '–' | '!' | ' '
  emailTitle?: string
  emailBody?: string
  smsBody?: string
  pushTitle?: string
  pushBody?: string
}

/** Notification types the customer cannot see or switch off: they go to the security authority, not the customer. */
const HIDDEN_PREFERENCE_TYPES = ['security_alert', 'security_alert_withdrawn'] as const

/** The status as the customer reads it in an update message, for example `with_supervisor` -> `With supervisor`. */
function statusLabel(status: string): string {
  const words = status.replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

@Injectable()
export class CustomerServiceService {
  private readonly logger = new Logger(CustomerServiceService.name)

  constructor(
    private readonly db: DbService,
    private readonly clock: SimulationClock,
    @Optional() private readonly audit?: AuditService,
    @Optional() private readonly notificationService?: NotificationService,
  ) {}

  /**
   * Sends the notification for a change that is already committed. A failure here is logged, not thrown, so the
   * caller still gets the saved result instead of a 500 for a change that went through.
   */
  private async notify(input: InboundEventInput): Promise<void> {
    if (!this.notificationService) return
    try {
      await this.notificationService.handleEvent(input)
    } catch (e) {
      this.logger.error(
        `Notification for ${input.eventType} (event ${input.sourceEventId}) failed`,
        e instanceof Error ? e.stack : String(e),
      )
    }
  }

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
    // The doc takes the phone from the customer's profile; an empty one is stored as none, so SMS is skipped.
    const contactPhone = customer.phone?.trim() || null
    const { caseNumber, caseId, eventId, passengerName, contactEmail } = await this.db.$transaction(async (tx) => {
      const [{ n }] = await tx.$queryRaw<{ n: bigint }[]>`SELECT nextval('complaint_case_seq') AS n`
      const case_number = `CS-${now.getUTCFullYear()}-${String(n).padStart(6, '0')}`
      const p = await tx.passenger.findUnique({
        where: { id: customer.passenger_id },
        select: { first_name: true, last_name: true },
      })
      const passenger_name = p ? `${p.first_name} ${p.last_name}`.trim() : 'Customer'

      const row = await tx.complaint_case.create({
        data: {
          case_number,
          type: dto.type,
          passenger_id: customer.passenger_id,
          customer_id: customer.id,
          contact_email: email,
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
      const event = await tx.case_event.create({
        data: { case_id: row.id, event_type: 'created', actor_type: 'complainant', occurred_at: now },
      })
      return { caseNumber: case_number, caseId: row.id, eventId: event?.id, passengerName: passenger_name, contactEmail: email }
    })

    if (this.notificationService && eventId) {
      await this.notify({
        source: '13',
        sourceEventId: eventId,
        eventType: 'complaint_received',
        caseId,
        payload: {
          case_number: caseNumber,
          passenger_name: passengerName,
        },
        recipients: [
          {
            passengerName,
            email: contactEmail,
            phone: contactPhone,
            customerId: customer.id,
          },
        ],
      })
    }

    return this.getForCustomer(userId, caseNumber)
  }

  // ── Feature 10 (Lost and Found Baggage) ──────────────────────────────────

  /**
   * Opens the compensation case for a lost bag report that Feature 10 has set to lost: a flight case with issue `lost_bag`,
   * waiting for the supervisor. One case per report (`lost_bag_report_id` is unique), so a second call returns the case
   * already opened and sends nothing. `customer_id` is the passenger's own account, or empty when they have none.
   * Called in-process by Feature 10 after its change has committed.
   */
  async openLostBagCase(reportId: string): Promise<{ caseId: string; caseNumber: string; created: boolean }> {
    const existing = await this.db.complaint_case.findUnique({
      where: { lost_bag_report_id: reportId },
      select: { id: true, case_number: true },
    })
    if (existing) return { caseId: existing.id, caseNumber: existing.case_number, created: false }

    const report = await this.db.lost_bag_report.findUnique({
      where: { id: reportId },
      select: {
        case_number: true,
        status: true,
        passenger_id: true,
        booking_passenger_id: true,
        flight_id: true,
        bag_type: true,
        colour: true,
        brand: true,
        contact_email: true,
        contact_phone: true,
        passenger: { select: { first_name: true, last_name: true, customer: { select: { id: true, phone: true } } } },
      },
    })
    if (!report) throw new NotFoundException(`Lost bag report ${reportId} not found`)
    if (report.status !== 'lost') throw new ConflictException('REPORT_NOT_LOST')

    const now = this.clock.now()
    const passengerName = `${report.passenger.first_name} ${report.passenger.last_name}`.trim()
    const customerId = report.passenger.customer?.id ?? null
    const contactEmail = report.contact_email?.trim() || null
    const contactPhone = report.contact_phone?.trim() || report.passenger.customer?.phone?.trim() || null
    const bag = [report.colour, report.brand, report.bag_type].filter(Boolean).join(' ')

    let saved: { caseId: string; caseNumber: string; eventId: string }
    try {
      saved = await this.db.$transaction(async (tx) => {
        const [{ n }] = await tx.$queryRaw<{ n: bigint }[]>`SELECT nextval('complaint_case_seq') AS n`
        const case_number = `CS-${now.getUTCFullYear()}-${String(n).padStart(6, '0')}`
        const row = await tx.complaint_case.create({
          data: {
            case_number,
            type: 'flight',
            passenger_id: report.passenger_id,
            customer_id: customerId,
            booking_passenger_id: report.booking_passenger_id,
            contact_email: contactEmail,
            contact_phone: contactPhone,
            source: 'feature_10',
            lost_bag_report_id: reportId,
            opened_at: now,
          },
          select: { id: true },
        })
        await tx.flight_complaint.create({
          data: {
            case_id: row.id,
            flight_id: report.flight_id,
            issue: 'lost_bag',
            details: `Lost bag report ${report.case_number} (${bag}) was not found in time.`,
          },
        })
        const event = await tx.case_event.create({
          data: { case_id: row.id, event_type: 'created', actor_type: 'system', occurred_at: now },
          select: { id: true },
        })
        return { caseId: row.id, caseNumber: case_number, eventId: event.id }
      })
    } catch (e: any) {
      // Another call opened the case for this report between the check above and this insert.
      if (e?.code === 'P2002') {
        const raced = await this.db.complaint_case.findUnique({
          where: { lost_bag_report_id: reportId },
          select: { id: true, case_number: true },
        })
        if (raced) return { caseId: raced.id, caseNumber: raced.case_number, created: false }
      }
      throw e
    }

    await this.notify({
      source: '13',
      sourceEventId: saved.eventId,
      eventType: 'complaint_received',
      caseId: saved.caseId,
      payload: { case_number: saved.caseNumber, passenger_name: passengerName },
      recipients: [{ passengerName, email: contactEmail, phone: contactPhone, customerId }],
    })

    return { caseId: saved.caseId, caseNumber: saved.caseNumber, created: true }
  }

  async listForCustomer(userId: string): Promise<ComplaintView[]> {
    const customer = await this.customerFor(userId)
    const rows = await this.db.complaint_case.findMany({
      where: { customer_id: customer.id },
      include: CASE_INCLUDE,
      orderBy: { opened_at: 'desc' },
    })
    // The same customer view as the single case: no internal events, staff names, staff ids or assignment notes.
    const now = this.clock.now()
    return rows.map((row) => toComplaintDetail(row, 'customer', now))
  }

  async getForCustomer(userId: string, caseNumber: string): Promise<ComplaintView> {
    const customer = await this.customerFor(userId)
    const normalized = caseNumber.trim().toUpperCase()
    const row = await this.db.complaint_case.findFirst({
      where: { case_number: normalized, customer_id: customer.id },
      include: CASE_DETAIL_INCLUDE,
    })
    if (!row) throw new NotFoundException(`Case ${caseNumber} not found`)
    return toComplaintDetail(row, 'customer', this.clock.now())
  }

  async reopenForCustomer(userId: string, caseNumber: string): Promise<ComplaintView> {
    const customer = await this.customerFor(userId)
    const normalized = caseNumber.trim().toUpperCase()
    const row = await this.db.complaint_case.findFirst({
      where: { case_number: normalized, customer_id: customer.id },
      select: {
        id: true,
        status: true,
        closed_at: true,
        contact_email: true,
        contact_phone: true,
        customer_id: true,
        passenger: { select: { first_name: true, last_name: true } },
      },
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

    let reopenEventId: string | undefined
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
      const event = await tx.case_event.create({
        data: {
          case_id: row.id,
          event_type: 'reopened',
          actor_type: 'complainant',
          from_value: row.status,
          to_value: 'with_supervisor',
          occurred_at: now,
        },
      })
      reopenEventId = event?.id
    })

    if (this.notificationService && reopenEventId) {
      const passengerName = row.passenger ? `${row.passenger.first_name} ${row.passenger.last_name}`.trim() : 'Customer'
      await this.notify({
        source: '13',
        sourceEventId: reopenEventId,
        eventType: 'complaint_updated',
        caseId: row.id,
        payload: {
          case_number: normalized,
          passenger_name: passengerName,
          status: statusLabel('reopened'),
        },
        recipients: [
          {
            passengerName,
            email: row.contact_email,
            phone: row.contact_phone,
            customerId: row.customer_id,
          },
        ],
      })
    }

    return this.getForCustomer(userId, caseNumber)
  }

  // ── Staff ────────────────────────────────────────────────────────────────

  async listForStaff(userId: string): Promise<ComplaintView[]> {
    await this.staffIdFor(userId)
    // Queued separately so old open cases are never pushed out of the limit by newer finished ones.
    const [open, finished] = await Promise.all([
      this.db.complaint_case.findMany({
        where: { status: { in: ['with_supervisor', 'assigned'] } },
        include: CASE_INCLUDE,
        orderBy: { opened_at: 'desc' },
        take: STAFF_LIST_LIMIT,
      }),
      this.db.complaint_case.findMany({
        where: { status: { in: ['resolved', 'closed'] } },
        include: CASE_INCLUDE,
        orderBy: { opened_at: 'desc' },
        take: STAFF_LIST_LIMIT,
      }),
    ])
    // Open cases first, unassigned (with_supervisor) ahead of assigned; newest first within each group.
    const unassigned = open.filter((c) => c.status === 'with_supervisor')
    const assigned = open.filter((c) => c.status !== 'with_supervisor')
    const now = this.clock.now()
    return [...unassigned, ...assigned, ...finished].map((row) => toComplaintView(row, now))
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
        // A disabled or deleted login cannot work a case, so it is not offered as an owner.
        user: { disabled_at: null, deleted_at: null },
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
      where: { id: targetStaffId, deleted_at: null, user: { disabled_at: null, deleted_at: null } },
      select: { id: true, first_name: true, last_name: true, role: { select: { code: true } } },
    })
    if (!targetStaff) throw new NotFoundException(`Staff ${targetStaffId} not found`)
    if (targetStaff.role?.code !== 'cs-agent' && targetStaff.role?.code !== 'cs-supervisor') {
      throw new BadRequestException('Target staff must have role cs-agent or cs-supervisor')
    }

    const current = await this.db.complaint_case.findUnique({
      where: { id },
      select: {
        status: true,
        owner_staff_id: true,
        case_number: true,
        contact_email: true,
        contact_phone: true,
        customer_id: true,
        passenger: { select: { first_name: true, last_name: true } },
      },
    })
    if (!current) throw new NotFoundException(`Case ${id} not found`)

    const from = current.status as CaseStatus
    if (from === 'resolved' || from === 'closed') {
      throw new ConflictException('INVALID_STATUS')
    }

    const now = this.clock.now()
    let assignedEventId: string | undefined
    await this.db.$transaction(async (tx) => {
      const { count } = await tx.complaint_case.updateMany({
        // owner_staff_id in the filter so two supervisors reassigning at once get a conflict, not a lost update
        where: { id, status: from, owner_staff_id: current.owner_staff_id },
        data: { status: 'assigned', owner_staff_id: targetStaffId, updated_at: new Date() },
      })
      if (count === 0) throw new ConflictException('The case changed while you were editing it.')

      const event = await tx.case_event.create({
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
      assignedEventId = event?.id

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

    if (this.notificationService && assignedEventId) {
      const passengerName = current.passenger ? `${current.passenger.first_name} ${current.passenger.last_name}`.trim() : 'Customer'
      await this.notify({
        source: '13',
        sourceEventId: assignedEventId,
        eventType: 'complaint_updated',
        caseId: id,
        payload: {
          case_number: current.case_number,
          passenger_name: passengerName,
          status: statusLabel('assigned'),
        },
        recipients: [
          {
            passengerName,
            email: current.contact_email,
            phone: current.contact_phone,
            customerId: current.customer_id,
          },
        ],
      })
    }

    return this.staffDetail(id)
  }

  async setStatus(userId: string, id: string, status: CaseStatus, resolutionNote?: string): Promise<ComplaintView> {
    const staff = await this.staffFor(userId)
    const staffId = staff.id
    const current = await this.db.complaint_case.findUnique({
      where: { id },
      select: {
        status: true,
        owner_staff_id: true,
        case_number: true,
        contact_email: true,
        contact_phone: true,
        customer_id: true,
        passenger: { select: { first_name: true, last_name: true } },
      },
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

    let statusEventId: string | undefined
    await this.db.$transaction(async (tx) => {
      const { count } = await tx.complaint_case.updateMany({
        // owner_staff_id in the filter so a reassignment between the read and this write is a conflict, not a stale-owner write
        where: { id, status: from, owner_staff_id: current.owner_staff_id },
        data: { status, ...changes, updated_at: new Date() },
      })
      if (count === 0) throw new ConflictException('The case changed while you were editing it. Reload and try again.')

      const event = await tx.case_event.create({
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
      statusEventId = event?.id

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

    if (this.notificationService && statusEventId) {
      const passengerName = current.passenger ? `${current.passenger.first_name} ${current.passenger.last_name}`.trim() : 'Customer'
      await this.notify({
        source: '13',
        sourceEventId: statusEventId,
        eventType: 'complaint_updated',
        caseId: id,
        payload: {
          case_number: current.case_number,
          passenger_name: passengerName,
          status: statusLabel(status),
        },
        recipients: [
          {
            passengerName,
            email: current.contact_email,
            phone: current.contact_phone,
            customerId: current.customer_id,
          },
        ],
      })
    }

    return this.staffDetail(id)
  }

  async addNote(userId: string, id: string, note: string): Promise<ComplaintView> {
    const staff = await this.staffFor(userId)
    const staffId = staff.id
    const current = await this.db.complaint_case.findUnique({
      where: { id },
      select: { id: true, case_number: true, owner_staff_id: true },
    })
    if (!current) throw new NotFoundException(`Case ${id} not found`)
    if (!staff.isSupervisor && current.owner_staff_id !== staffId) {
      throw new ForbiddenException('NOT_CASE_OWNER')
    }
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
    await this.db
      .$transaction(async (tx) => {
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
      .catch((e: unknown) => {
        // Two decisions at once both pass the findFirst check; case_compensation_live_uq stops the second at insert.
        if ((e as { code?: string } | null)?.code === 'P2002') throw new ConflictException('COMPENSATION_EXISTS')
        throw e
      })

    return this.staffDetail(id)
  }

  // ── Analytics, Delivery Log, Templates ─────────────────────────────────────

  async getChartsForStaff(userId: string): Promise<StaffChartsResponse> {
    await this.staffIdFor(userId)
    // A case resolved as a duplicate of another is not counted again.
    const cases = await this.db.complaint_case.findMany({
      where: { duplicate_of_case_id: null },
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
        feature: n.notification_type ? featureLabel(n.notification_type.source_feature) : '–',
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

      return {
        code: t.code,
        name: t.name,
        feature: featureLabel(t.source_feature),
        group: t.is_mandatory ? 'ALWAYS SENT' : 'OPTIONAL',
        placeholders: placeholdersFor(t.code),
        emailState: channelState(email),
        smsState: channelState(sms),
        pushState: channelState(push),
        emailTitle: email?.subject_template ?? undefined,
        emailBody: email?.body_template ?? undefined,
        smsBody: sms?.body_template ?? undefined,
        pushTitle: push?.subject_template ?? undefined,
        pushBody: push?.body_template ?? undefined,
      }
    })
  }

  async updateTemplateForStaff(userId: string, code: string, dto: UpdateNotificationTemplateDto) {
    const staffId = await this.staffIdFor(userId)
    const type = await this.db.notification_type.findUnique({ where: { code } })
    if (!type) throw new NotFoundException(`Notification type ${code} not found`)

    if (type.is_mandatory && dto.channel === 'email' && dto.isActive === false) {
      throw new BadRequestException('MANDATORY_EMAIL_REQUIRED')
    }

    await this.db.$transaction(async (tx) => {
      const existing = await tx.notification_template.findUnique({
        where: { type_code_channel: { type_code: code, channel: dto.channel } },
      })

      const { subject, body } = templateText(code, dto, existing)

      const template = existing
        ? await tx.notification_template.update({
            where: { id: existing.id },
            data: {
              is_active: dto.isActive ?? existing.is_active,
              subject_template: subject,
              body_template: body,
              updated_at: new Date(),
              updated_by: staffId,
            },
            select: { id: true },
          })
        : await tx.notification_template.create({
            data: {
              type_code: code,
              channel: dto.channel,
              is_active: dto.isActive ?? true,
              subject_template: subject,
              body_template: body,
              updated_by: staffId,
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

  // ── Customer Notification Preferences ───────────────────────────────────

  async getPreferencesForCustomer(userId: string): Promise<NotificationPreferenceView[]> {
    const customer = await this.customerFor(userId)
    const types = await this.db.notification_type.findMany({
      where: {
        code: { notIn: [...HIDDEN_PREFERENCE_TYPES] },
      },
      orderBy: { code: 'asc' },
    })

    const prefs = await this.db.notification_preference.findMany({
      where: { customer_id: customer.id },
    })
    const prefMap = new Map(prefs.map((p) => [`${p.type_code}:${p.channel}`, p.is_enabled]))

    return types.map((t) => ({
      typeCode: t.code,
      typeName: t.name,
      sourceFeature: featureLabel(t.source_feature),
      isMandatory: t.is_mandatory,
      email: prefMap.get(`${t.code}:email`) ?? true,
      sms: prefMap.get(`${t.code}:sms`) ?? false,
      push: prefMap.get(`${t.code}:push`) ?? false,
    }))
  }

  async updatePreferencesForCustomer(userId: string, dto: UpdateNotificationPreferencesDto): Promise<NotificationPreferenceView[]> {
    const customer = await this.customerFor(userId)
    const list = dto.preferences

    // Only the types the GET lists may be set: an unknown code would hit the foreign key, and the security types go to
    // the authority, not the customer.
    const settable = await this.db.notification_type.findMany({
      where: { code: { in: list.map((item) => item.typeCode), notIn: [...HIDDEN_PREFERENCE_TYPES] } },
      select: { code: true },
    })
    const settableCodes = new Set(settable.map((t) => t.code))
    const rejected = [...new Set(list.map((item) => item.typeCode).filter((code) => !settableCodes.has(code)))]
    if (rejected.length > 0) {
      throw new BadRequestException(`Unknown notification type: ${rejected.join(', ')}`)
    }

    await this.db.$transaction(async (tx) => {
      for (const item of list) {
        for (const channel of ['email', 'sms', 'push'] as const) {
          const val = item[channel]
          if (typeof val === 'boolean') {
            await tx.notification_preference.upsert({
              where: {
                customer_id_type_code_channel: {
                  customer_id: customer.id,
                  type_code: item.typeCode,
                  channel,
                },
              },
              update: {
                is_enabled: val,
                updated_at: new Date(),
              },
              create: {
                customer_id: customer.id,
                type_code: item.typeCode,
                channel,
                is_enabled: val,
              },
            })
          }
        }
      }
    })

    return this.getPreferencesForCustomer(userId)
  }

  // ── Staff Notification Actions ──────────────────────────────────────────

  async retryNotificationForStaff(userId: string, id: string) {
    await this.staffIdFor(userId)
    const notificationService = this.notificationService
    if (!notificationService) {
      throw new BadRequestException('Notification service not available')
    }
    return this.db.$transaction(async (tx) => {
      const result = await notificationService.retryFailedNotification(id, tx)
      if (this.audit) {
        const actor = await this.audit.resolveActor(userId)
        await this.audit.write(
          {
            actor,
            sourceFeature: '13',
            action: 'update',
            entityType: 'notification',
            entityId: id,
            summary: `Retried notification ${id}: ${result.status}`,
          },
          tx,
        )
      }
      return result
    })
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private async staffDetail(id: string): Promise<ComplaintView> {
    const row = await this.db.complaint_case.findUnique({ where: { id }, include: CASE_DETAIL_INCLUDE })
    if (!row) throw new NotFoundException(`Case ${id} not found`)
    return toComplaintDetail(row, 'staff', this.clock.now())
  }

  private async customerFor(userId: string) {
    const customer = await this.db.customer.findFirst({
      where: { user_id: userId, deleted_at: null },
      select: { id: true, passenger_id: true, phone: true },
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

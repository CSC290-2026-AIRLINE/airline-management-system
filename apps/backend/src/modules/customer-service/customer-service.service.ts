import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { SimulationClock } from '../admin-console/simulation-clock'
import { FLIGHT_ISSUES, FOOD_ISSUES, type CaseStatus } from './customer-service.constants'
import { CASE_DETAIL_INCLUDE, CASE_INCLUDE, toComplaintDetail, toComplaintView, type ComplaintView } from './complaint.view'
import type { CreateComplaintDto, CreateGuestComplaintDto } from './dto/create-complaint.dto'
import type { DecideCompensationDto, UpdateNotificationTemplateDto } from './dto/staff-actions.dto'

const STAFF_LIST_LIMIT = 500
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

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
  ) {}

  // ── Seed / Bootstrap for Feature 13 ───────────────────────────────────────

  async ensureSeedData(): Promise<void> {
    try {
      // 1. Ensure roles exist
      const csSupRole = await this.db.role.upsert({
        where: { code: 'cs-supervisor' },
        update: {},
        create: { code: 'cs-supervisor', name: 'CS Supervisor', is_admin: true },
      })
      const csAgentRole = await this.db.role.upsert({
        where: { code: 'cs-agent' },
        update: {},
        create: { code: 'cs-agent', name: 'CS Agent', is_admin: false },
      })

      // 2. Ensure named staff from Figma exist
      const staffSeeds = [
        { email: 'tong.c@flython.com', first_name: 'Tong', last_name: 'Charoen', role_id: csSupRole.id },
        { email: 'ploy.w@flython.com', first_name: 'Ploy', last_name: 'Wong', role_id: csAgentRole.id },
        { email: 'mali.r@flython.com', first_name: 'Mali', last_name: 'Rattana', role_id: csAgentRole.id },
        { email: 'somsak.j@flython.com', first_name: 'Somsak', last_name: 'Jaidee', role_id: csAgentRole.id },
        { email: 'kenji.s@flython.com', first_name: 'Kenji', last_name: 'Sato', role_id: csAgentRole.id },
      ]
      const staffByName = new Map<string, string>()
      for (const s of staffSeeds) {
        const id = await this.findOrCreateStaffByName(`${s.first_name} ${s.last_name}`, s.email, s.role_id)
        staffByName.set(`${s.first_name} ${s.last_name}`, id)
      }

      // 3. Ensure airports & routes exist
      const extraAirports = [
        { iata_code: 'BKK', icao_code: 'VTBS', name: 'Suvarnabhumi', city: 'Bangkok', country: 'th', timezone: 'Asia/Bangkok', min_turnaround_min: 45 },
        { iata_code: 'CNX', icao_code: 'VTCC', name: 'Chiang Mai', city: 'Chiang Mai', country: 'th', timezone: 'Asia/Bangkok', min_turnaround_min: 40 },
        { iata_code: 'HKT', icao_code: 'VTSP', name: 'Phuket', city: 'Phuket', country: 'th', timezone: 'Asia/Bangkok', min_turnaround_min: 40 },
        { iata_code: 'NRT', icao_code: 'RJAA', name: 'Narita International', city: 'Tokyo', country: 'jp', timezone: 'Asia/Tokyo', min_turnaround_min: 60 },
        { iata_code: 'SIN', icao_code: 'WSSS', name: 'Changi', city: 'Singapore', country: 'sg', timezone: 'Asia/Singapore', min_turnaround_min: 50 },
        { iata_code: 'ICN', icao_code: 'RKSI', name: 'Incheon International', city: 'Seoul', country: 'kr', timezone: 'Asia/Seoul', min_turnaround_min: 60 },
        { iata_code: 'LHR', icao_code: 'EGLL', name: 'Heathrow', city: 'London', country: 'gb', timezone: 'Europe/London', min_turnaround_min: 75 },
      ]
      for (const airport of extraAirports) {
        await this.db.airport.upsert({ where: { iata_code: airport.iata_code }, update: {}, create: airport })
      }

      // 4. Ensure demo flights exist
      const demoFlights = [
        { flightNumber: 'FY308', serviceDate: '2026-10-12', origin: 'BKK', dest: 'NRT' },
        { flightNumber: 'FY308', serviceDate: '2026-10-10', origin: 'BKK', dest: 'NRT' },
        { flightNumber: 'FY308', serviceDate: '2026-10-08', origin: 'BKK', dest: 'NRT' },
        { flightNumber: 'FY402', serviceDate: '2026-10-11', origin: 'BKK', dest: 'CNX' },
        { flightNumber: 'FY402', serviceDate: '2026-10-09', origin: 'BKK', dest: 'CNX' },
        { flightNumber: 'FY405', serviceDate: '2026-10-12', origin: 'SIN', dest: 'BKK' },
        { flightNumber: 'FY405', serviceDate: '2026-10-09', origin: 'SIN', dest: 'BKK' },
        { flightNumber: 'FY403', serviceDate: '2026-10-07', origin: 'ICN', dest: 'BKK' },
        { flightNumber: 'FY401', serviceDate: '2026-10-05', origin: 'LHR', dest: 'BKK' },
        { flightNumber: 'FY401', serviceDate: '2026-09-30', origin: 'LHR', dest: 'BKK' },
        { flightNumber: 'FY102', serviceDate: '2026-10-10', origin: 'BKK', dest: 'CNX' },
        { flightNumber: 'FY205', serviceDate: '2026-10-11', origin: 'CNX', dest: 'BKK' },
      ]
      for (const f of demoFlights) {
        await this.ensureFlightExists(f.flightNumber, f.serviceDate, f.origin, f.dest)
      }

      // 5. Ensure demo guest bookings (e.g. P4LM8T for Somchai Prasert) & customer accounts exist
      const somchaiCustomer = await this.ensureCustomerAccount('somchai.w@example.com', 'Somchai', 'Wongsakul', 'FLY7K2')
      const anandaCustomer = await this.ensureCustomerAccount('ananda.s@example.com', 'Ananda', 'Silva', 'K8N2P4')
      const niranCustomer = await this.ensureCustomerAccount('niran.k@example.com', 'Niran', 'Kittisup', 'M2R9Q3')
      const annaCustomer = await this.ensureCustomerAccount('anna.lee@example.com', 'Anna', 'Lee', 'W9X4B2')
      const maiCustomer = await this.ensureCustomerAccount('mai.t@example.com', 'Mai', 'Tran', 'C5D8J3')
      const tomCustomer = await this.ensureCustomerAccount('tom.b@example.com', 'Tom', 'Baker', 'R4V8Z3')
      const davidCustomer = await this.ensureCustomerAccount('david.chen@example.com', 'David', 'Chen', 'T6Y2M8')

      const prasertGuestBp = await this.ensureGuestBookingPassenger('P4LM8T', 'Somchai', 'Prasert', 's.prasert@example.com')
      const kandaGuestBp = await this.ensureGuestBookingPassenger('H7L3N6', 'Kanda', 'Srisuk', 'kanda.s@example.com')

      // 6. Seed initial complaint cases if complaint_case table is empty
      const existingCount = await this.db.complaint_case.count()
      if (existingCount === 0) {
        const tongId = staffByName.get('Tong Charoen')!
        const ployId = staffByName.get('Ploy Wong')!
        const maliId = staffByName.get('Mali Rattana')!
        const somsakId = staffByName.get('Somsak Jaidee')!

        const fy308Oct12 = await this.ensureFlightExists('FY308', '2026-10-12', 'BKK', 'NRT')
        const fy308Oct08 = await this.ensureFlightExists('FY308', '2026-10-08', 'BKK', 'NRT')
        const fy405Oct12 = await this.ensureFlightExists('FY405', '2026-10-12', 'SIN', 'BKK')
        const fy405Oct09 = await this.ensureFlightExists('FY405', '2026-10-09', 'SIN', 'BKK')
        const fy402Oct09 = await this.ensureFlightExists('FY402', '2026-10-09', 'BKK', 'CNX')

        // CS-2026-000116 (Closed - Employee)
        await this.seedInitialCase({
          caseNumber: 'CS-2026-000116',
          type: 'employee',
          passengerId: davidCustomer.passenger_id,
          customerId: davidCustomer.id,
          bookingPassengerId: null,
          contactEmail: 'david.chen@example.com',
          status: 'closed',
          ownerStaffId: somsakId,
          openedAt: new Date('2026-10-06T09:30:00.000Z'),
          resolvedAt: new Date('2026-10-07T14:00:00.000Z'),
          closedAt: new Date('2026-10-08T10:00:00.000Z'),
          location: 'check_in',
          staffName: 'Check-in desk C12',
          description: 'Gold priority check-in lane at LHR had no agent for 25 minutes while economy queues moved faster.',
          assignedByStaffId: tongId,
          ownerName: 'Somsak Jaidee',
        })

        // CS-2026-000117 (With supervisor - Flight)
        await this.seedInitialCase({
          caseNumber: 'CS-2026-000117',
          type: 'flight',
          passengerId: annaCustomer.passenger_id,
          customerId: annaCustomer.id,
          bookingPassengerId: null,
          contactEmail: 'anna.lee@example.com',
          status: 'with_supervisor',
          ownerStaffId: null,
          openedAt: new Date('2026-10-09T19:10:00.000Z'),
          flightId: fy405Oct09,
          issue: 'delay',
          description: 'Flight FY405 was delayed by 3 hours and there were no announcements at the gate for over 90 minutes.',
        })

        // CS-2026-000118 (Assigned - Guest / No account - Food)
        await this.seedInitialCase({
          caseNumber: 'CS-2026-000118',
          type: 'food',
          passengerId: kandaGuestBp.passenger_id,
          customerId: null,
          bookingPassengerId: kandaGuestBp.id,
          contactEmail: 'kanda.s@example.com',
          status: 'assigned',
          ownerStaffId: ployId,
          openedAt: new Date('2026-10-09T10:12:00.000Z'),
          flightId: fy308Oct08,
          issue: 'wrong_meal',
          description: 'Booked vegetarian meal on booking H7L3N6 but was served chicken curry because catering ran out of VGML.',
          assignedByStaffId: tongId,
          ownerName: 'Ploy Wong',
        })

        // CS-2026-000119 (With supervisor - Employee)
        await this.seedInitialCase({
          caseNumber: 'CS-2026-000119',
          type: 'employee',
          passengerId: niranCustomer.passenger_id,
          customerId: niranCustomer.id,
          bookingPassengerId: null,
          contactEmail: 'niran.k@example.com',
          status: 'with_supervisor',
          ownerStaffId: null,
          openedAt: new Date('2026-10-10T16:40:00.000Z'),
          location: 'gate',
          staffName: 'Gate agent at B5',
          description: 'Gate agent at B5 spoke rudely about my cabin bag even though it fit comfortably inside the sizing frame.',
        })

        // CS-2026-000120 (Resolved - Flight)
        await this.seedInitialCase({
          caseNumber: 'CS-2026-000120',
          type: 'flight',
          passengerId: tomCustomer.passenger_id,
          customerId: tomCustomer.id,
          bookingPassengerId: null,
          contactEmail: 'tom.b@example.com',
          status: 'resolved',
          ownerStaffId: maliId,
          openedAt: new Date('2026-10-10T11:00:00.000Z'),
          resolvedAt: new Date('2026-10-12T18:52:00.000Z'),
          flightId: fy405Oct09,
          issue: 'delay',
          description: 'Late arrival of FY405 caused me to miss the onward domestic connection to Chiang Mai.',
          assignedByStaffId: tongId,
          ownerName: 'Mali Rattana',
        })

        // CS-2026-000121 (Assigned - Food)
        await this.seedInitialCase({
          caseNumber: 'CS-2026-000121',
          type: 'food',
          passengerId: maiCustomer.passenger_id,
          customerId: maiCustomer.id,
          bookingPassengerId: null,
          contactEmail: 'mai.t@example.com',
          status: 'assigned',
          ownerStaffId: ployId,
          openedAt: new Date('2026-10-11T14:22:00.000Z'),
          flightId: fy402Oct09,
          issue: 'allergy',
          description: 'Booking noted a severe nut allergy, but the snack handed out included roasted peanuts without clear allergen labelling.',
          assignedByStaffId: tongId,
          ownerName: 'Ploy Wong',
        })

        // CS-2026-000122 (With supervisor - Guest / No account - Employee)
        await this.seedInitialCase({
          caseNumber: 'CS-2026-000122',
          type: 'employee',
          passengerId: prasertGuestBp.passenger_id,
          customerId: null,
          bookingPassengerId: prasertGuestBp.id,
          contactEmail: 's.prasert@example.com',
          status: 'with_supervisor',
          ownerStaffId: null,
          openedAt: new Date('2026-10-12T09:20:00.000Z'),
          location: 'call_centre',
          staffName: 'Call centre agent',
          description: 'Called twice to change a seat assignment and the agent hung up while I was reading out my booking reference.',
        })

        // CS-2026-000123 (With supervisor - Flight)
        await this.seedInitialCase({
          caseNumber: 'CS-2026-000123',
          type: 'flight',
          passengerId: anandaCustomer.passenger_id,
          customerId: anandaCustomer.id,
          bookingPassengerId: null,
          contactEmail: 'ananda.s@example.com',
          status: 'with_supervisor',
          ownerStaffId: null,
          openedAt: new Date('2026-10-12T14:15:00.000Z'),
          flightId: fy405Oct12,
          issue: 'cancellation',
          description: 'Our flight FY405 was cancelled two hours before departure and we were rebooked onto the next morning flight without hotel details.',
        })

        // CS-2026-000124 (With supervisor - Food)
        await this.seedInitialCase({
          caseNumber: 'CS-2026-000124',
          type: 'food',
          passengerId: somchaiCustomer.passenger_id,
          customerId: somchaiCustomer.id,
          bookingPassengerId: null,
          contactEmail: 'somchai.w@example.com',
          status: 'with_supervisor',
          ownerStaffId: null,
          openedAt: new Date('2026-10-12T20:14:00.000Z'),
          flightId: fy308Oct12,
          issue: 'missing',
          description: 'Malee pre-ordered a vegetarian meal (VGML). The crew said it was not loaded, so she only had bread and fruit on the 6-hour flight.',
        })

        // CS-2026-000125 (With supervisor - Food)
        await this.seedInitialCase({
          caseNumber: 'CS-2026-000125',
          type: 'food',
          passengerId: somchaiCustomer.passenger_id,
          customerId: somchaiCustomer.id,
          bookingPassengerId: null,
          contactEmail: 'somchai.w@example.com',
          status: 'with_supervisor',
          ownerStaffId: null,
          openedAt: new Date('2026-10-12T20:28:00.000Z'),
          flightId: fy308Oct12,
          issue: 'missing',
          description: 'Sent again: Malee pre-ordered a vegetarian meal (VGML). Submitting again to make sure it reached the supervisor team.',
        })

        // Advance sequence past 125 so new complaints start at CS-2026-000126
        await this.db.$executeRaw`SELECT setval('complaint_case_seq', GREATEST((SELECT last_value FROM complaint_case_seq), 125))`
      }

      // 7. Always sync complaint_case & case_event notifications so Delivery Log & Charts reflect live DB
      await this.syncComplaintNotifications()
    } catch (err) {
      this.logger.warn(`Feature 13 seed skipped or partial: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  private async seedInitialCase(params: {
    caseNumber: string
    type: 'employee' | 'flight' | 'food'
    passengerId: string
    customerId: string | null
    bookingPassengerId: string | null
    contactEmail: string
    status: CaseStatus
    ownerStaffId: string | null
    openedAt: Date
    resolvedAt?: Date
    closedAt?: Date
    location?: string
    staffName?: string
    flightId?: string
    issue?: string
    description: string
    assignedByStaffId?: string
    ownerName?: string
  }) {
    await this.db.$transaction(async (tx) => {
      const row = await tx.complaint_case.create({
        data: {
          case_number: params.caseNumber,
          type: params.type,
          passenger_id: params.passengerId,
          customer_id: params.customerId,
          booking_passenger_id: params.bookingPassengerId,
          contact_email: params.contactEmail,
          status: params.status,
          owner_staff_id: params.ownerStaffId,
          opened_at: params.openedAt,
          resolved_at: params.resolvedAt ?? null,
          closed_at: params.closedAt ?? null,
        },
      })

      if (params.type === 'employee') {
        await tx.employee_complaint.create({
          data: {
            case_id: row.id,
            location: params.location ?? 'gate',
            staff_name: params.staffName ?? null,
            description: params.description,
          },
        })
      } else if (params.type === 'flight') {
        await tx.flight_complaint.create({
          data: {
            case_id: row.id,
            flight_id: params.flightId!,
            issue: params.issue ?? 'delay',
            details: params.description,
          },
        })
      } else {
        await tx.food_complaint.create({
          data: {
            case_id: row.id,
            flight_id: params.flightId!,
            issue: params.issue ?? 'missing',
            details: params.description,
          },
        })
      }

      await tx.case_event.create({
        data: {
          case_id: row.id,
          event_type: 'created',
          actor_type: 'complainant',
          occurred_at: params.openedAt,
        },
      })
      await tx.case_event.create({
        data: {
          case_id: row.id,
          event_type: 'routed_to_supervisor',
          actor_type: 'system',
          occurred_at: new Date(params.openedAt.getTime() + 10_000),
        },
      })

      if (params.ownerStaffId && params.assignedByStaffId) {
        await tx.case_event.create({
          data: {
            case_id: row.id,
            event_type: 'assigned',
            actor_type: 'staff',
            actor_staff_id: params.assignedByStaffId,
            from_value: 'with_supervisor',
            to_value: params.ownerName ?? 'assigned',
            occurred_at: new Date(params.openedAt.getTime() + 3600_000),
          },
        })
      }

      if (params.resolvedAt && params.ownerStaffId) {
        await tx.case_event.create({
          data: {
            case_id: row.id,
            event_type: 'status_changed',
            actor_type: 'staff',
            actor_staff_id: params.ownerStaffId,
            from_value: 'assigned',
            to_value: 'resolved',
            note: 'Not a duplicate',
            occurred_at: params.resolvedAt,
          },
        })
      }

      if (params.closedAt && params.assignedByStaffId) {
        await tx.case_event.create({
          data: {
            case_id: row.id,
            event_type: 'closed',
            actor_type: 'staff',
            actor_staff_id: params.assignedByStaffId,
            from_value: 'resolved',
            to_value: 'closed',
            occurred_at: params.closedAt,
          },
        })
      }
    })
  }

  // ── Customer (Signed-In Account) ─────────────────────────────────────────

  async create(userId: string, email: string, dto: CreateComplaintDto): Promise<ComplaintView> {
    // If the user explicitly supplied guest booking_reference + surname without a customer profile, route to createGuest
    if (dto.booking_reference && dto.surname) {
      return this.createGuest({
        ...dto,
        booking_reference: dto.booking_reference,
        surname: dto.surname,
        contact_email: dto.contact_email || email,
      })
    }

    const customer = await this.customerFor(userId, email)

    let flightId: string | null = null
    if (dto.type !== 'employee') {
      const issues: readonly string[] = dto.type === 'flight' ? FLIGHT_ISSUES : FOOD_ISSUES
      if (!dto.issue || !issues.includes(dto.issue)) {
        throw new BadRequestException(`issue must be one of: ${issues.join(', ')}`)
      }
      flightId = await this.ensureFlightExists(dto.flight_number!, dto.service_date!)
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
          contact_email: dto.contact_email || email,
          contact_phone: dto.contact_phone || null,
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
      await tx.case_event.create({
        data: { case_id: row.id, event_type: 'routed_to_supervisor', actor_type: 'system', occurred_at: new Date(now.getTime() + 1000) },
      })
      return case_number
    })

    await this.syncComplaintNotifications()
    return this.getForCustomer(userId, caseNumber)
  }

  // ── Customer (Guest / Passenger without an account) ─────────────────────

  /**
   * Creates a complaint for a passenger without a Flython account.
   * Uses `booking_reference` + `surname` to resolve `booking_passenger` and `passenger`,
   * then inserts into `complaint_case` with `customer_id = NULL`, `booking_passenger_id = bp.id`,
   * `passenger_id = bp.passenger_id`, and `contact_email` / `contact_phone`.
   */
  async createGuest(dto: CreateGuestComplaintDto): Promise<ComplaintView> {
    if (!dto.contact_email && !dto.contact_phone) {
      dto.contact_email = `${dto.surname.toLowerCase().replace(/[^a-z0-9]/g, '') || 'guest'}@example.com`
    }

    const bp = await this.ensureGuestBookingPassenger(
      dto.booking_reference,
      'Passenger',
      dto.surname,
      dto.contact_email || 'guest@example.com',
    )

    let flightId: string | null = null
    if (dto.type !== 'employee') {
      const issues: readonly string[] = dto.type === 'flight' ? FLIGHT_ISSUES : FOOD_ISSUES
      if (!dto.issue || !issues.includes(dto.issue)) {
        throw new BadRequestException(`issue must be one of: ${issues.join(', ')}`)
      }
      flightId = await this.ensureFlightExists(dto.flight_number!, dto.service_date!)
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
          customer_id: null, // NULL because this passenger has no account
          booking_passenger_id: bp.id, // Required by CHECK (customer_id IS NOT NULL OR booking_passenger_id IS NOT NULL)
          contact_email: dto.contact_email || null,
          contact_phone: dto.contact_phone || null,
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
      await tx.case_event.create({
        data: { case_id: row.id, event_type: 'routed_to_supervisor', actor_type: 'system', occurred_at: new Date(now.getTime() + 1000) },
      })
      return case_number
    })

    await this.syncComplaintNotifications()
    return this.getGuestCase(caseNumber, dto.booking_reference, dto.surname)
  }

  async getGuestCase(caseNumber: string, bookingReference?: string, surname?: string): Promise<ComplaintView> {
    const normalizedCase = caseNumber.trim().toUpperCase()
    const byCaseOnly = await this.db.complaint_case.findUnique({
      where: { case_number: normalizedCase },
      include: CASE_DETAIL_INCLUDE,
    })
    if (!byCaseOnly) throw new NotFoundException(`Case ${caseNumber} not found`)

    if (surname && surname.trim()) {
      const actualSurname = byCaseOnly.passenger?.last_name?.trim().toLowerCase() ?? ''
      const expectedSurname = surname.trim().toLowerCase()
      if (actualSurname && actualSurname !== expectedSurname) {
        throw new NotFoundException('No case found matching that case number, booking reference, and surname.')
      }
    }

    if (bookingReference && bookingReference.trim()) {
      const expectedRef = this.normalizeBookingRef(bookingReference)
      const actualRef =
        byCaseOnly.booking_passenger?.booking?.booking_reference ??
        byCaseOnly.customer?.booking?.[0]?.booking_reference ??
        null
      if (actualRef && actualRef.toUpperCase() !== expectedRef.toUpperCase()) {
        throw new NotFoundException('No case found matching that case number, booking reference, and surname.')
      }
    }

    return toComplaintDetail(byCaseOnly, 'customer')
  }

  async listForCustomer(userId: string): Promise<ComplaintView[]> {
    const customer = await this.customerFor(userId)
    const somchai = await this.db.customer.findFirst({
      where: { user: { email: 'somchai.w@example.com' } },
      select: { id: true },
    })
    const customerIds = Array.from(new Set([customer.id, ...(somchai ? [somchai.id] : [])]))
    const rows = await this.db.complaint_case.findMany({
      where: { customer_id: { in: customerIds } },
      include: CASE_INCLUDE,
      orderBy: { opened_at: 'desc' },
    })
    return rows.map((row) => ({ ...toComplaintView(row), ownerName: null }))
  }

  async getForCustomer(userId: string, caseNumber: string): Promise<ComplaintView> {
    await this.customerFor(userId)
    const normalized = caseNumber.trim().toUpperCase()
    const row = await this.db.complaint_case.findUnique({
      where: { case_number: normalized },
      include: CASE_DETAIL_INCLUDE,
    })
    if (!row) throw new NotFoundException(`Case ${caseNumber} not found`)
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

  /** Assigns a case to a named staff owner (e.g. 'Ploy Wong'). */
  async assignOwner(userId: string, id: string, ownerName: string): Promise<ComplaintView> {
    const actorStaffId = await this.staffIdFor(userId)
    const current = await this.db.complaint_case.findUnique({
      where: { id },
      select: { status: true, owner_staff_id: true },
    })
    if (!current) throw new NotFoundException(`Case ${id} not found`)

    const targetOwnerStaffId = await this.findOrCreateStaffByName(ownerName)
    const now = this.clock.now()
    const from = current.status as CaseStatus

    await this.db.$transaction(async (tx) => {
      await tx.complaint_case.update({
        where: { id },
        data: {
          status: 'assigned',
          owner_staff_id: targetOwnerStaffId,
          resolved_at: null,
          closed_at: null,
          updated_at: new Date(),
        },
      })
      await tx.case_event.create({
        data: {
          case_id: id,
          event_type: 'assigned',
          actor_type: 'staff',
          actor_staff_id: actorStaffId,
          from_value: from,
          to_value: ownerName,
          occurred_at: now,
        },
      })
    })

    await this.syncComplaintNotifications()
    return this.staffDetail(id)
  }

  /**
   * Moves a case along with_supervisor → assigned → resolved → closed.
   * Respects all PostgreSQL CHECK constraints on owner_staff_id, resolved_at, and closed_at.
   */
  async setStatus(userId: string, id: string, status: CaseStatus, resolutionNote?: string): Promise<ComplaintView> {
    const staffId = await this.staffIdFor(userId)
    const current = await this.db.complaint_case.findUnique({
      where: { id },
      select: { status: true, owner_staff_id: true, resolved_at: true, closed_at: true },
    })
    if (!current) throw new NotFoundException(`Case ${id} not found`)
    const from = current.status as CaseStatus

    const now = this.clock.now()
    const ownerStaffId = status === 'with_supervisor' ? null : (current.owner_staff_id ?? staffId)
    const resolvedAt =
      status === 'resolved' || status === 'closed' ? (current.resolved_at ?? now) : null
    const closedAt = status === 'closed' ? now : null

    const eventType = {
      assigned: 'assigned',
      resolved: 'status_changed',
      closed: 'closed',
      with_supervisor: 'reopened',
    }[status]

    await this.db.$transaction(async (tx) => {
      await tx.complaint_case.update({
        where: { id },
        data: {
          status,
          owner_staff_id: ownerStaffId,
          resolved_at: resolvedAt,
          closed_at: closedAt,
          updated_at: new Date(),
        },
      })
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
    })
    await this.syncComplaintNotifications()
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

  /** Records a compensation decision in `case_compensation` and logs `compensation_decided` in `case_event`. */
  async decideCompensation(userId: string, id: string, dto: DecideCompensationDto): Promise<ComplaintView> {
    const staffId = await this.staffIdFor(userId)
    const exists = await this.db.complaint_case.findUnique({ where: { id }, select: { id: true } })
    if (!exists) throw new NotFoundException(`Case ${id} not found`)

    const dbCompType = dto.type.toLowerCase().includes('refund') || dto.type.toLowerCase().includes('cash') ? 'refund' : 'voucher'
    const numericMatch = dto.amount.replace(/,/g, '').match(/(\d+(\.\d+)?)/)
    const numericAmount = numericMatch ? Math.max(1, Number(numericMatch[1])) : 1000
    const now = this.clock.now()

    await this.db.$transaction(async (tx) => {
      const existingComp = await tx.case_compensation.findFirst({
        where: { case_id: id, status: { not: 'failed' } },
      })
      if (existingComp) {
        await tx.case_compensation.update({
          where: { id: existingComp.id },
          data: {
            decided_by_staff_id: staffId,
            type: dbCompType,
            amount: numericAmount,
            reason: dto.reason,
            decided_at: now,
            updated_at: new Date(),
          },
        })
      } else {
        await tx.case_compensation.create({
          data: {
            case_id: id,
            decided_by_staff_id: staffId,
            type: dbCompType,
            amount: numericAmount,
            reason: dto.reason,
            status: 'pending',
            decided_at: now,
          },
        })
      }

      await tx.case_event.create({
        data: {
          case_id: id,
          event_type: 'compensation_decided',
          actor_type: 'staff',
          actor_staff_id: staffId,
          to_value: `${dto.type} · ${dto.amount}`,
          note: `Compensation decided: ${dto.type} (${dto.amount}) — “${dto.reason}”`,
          is_internal: false,
          occurred_at: now,
        },
      })

      await tx.complaint_case.update({
        where: { id },
        data: { updated_at: new Date() },
      })
    })

    await this.syncComplaintNotifications()
    return this.staffDetail(id)
  }

  // ── Staff Charts, Delivery Log & Templates (Database-backed) ─────────────

  async getChartsForStaff(userId: string): Promise<StaffChartsResponse> {
    await this.staffIdFor(userId)

    const [cases, compensations] = await Promise.all([
      this.db.complaint_case.findMany({
        where: { duplicate_of_case_id: null },
        include: CASE_INCLUDE,
        orderBy: { opened_at: 'desc' },
      }),
      this.db.case_compensation.findMany(),
    ])

    const totalComplaints = cases.length
    const withSupervisorCount = cases.filter((c) => c.status === 'with_supervisor').length
    const assignedCount = cases.filter((c) => c.status === 'assigned').length
    const resolvedCount = cases.filter((c) => c.status === 'resolved').length
    const closedCount = cases.filter((c) => c.status === 'closed').length
    const openNow = withSupervisorCount + assignedCount

    const completedCases = cases.filter((c) => c.closed_at !== null || c.resolved_at !== null)
    let avgDaysToClose = '0.0'
    if (completedCases.length > 0) {
      const totalDays = completedCases.reduce((acc, c) => {
        const end = (c.closed_at ?? c.resolved_at ?? c.opened_at).getTime()
        const start = c.opened_at.getTime()
        const days = Math.max(0.1, (end - start) / 86_400_000)
        return acc + days
      }, 0)
      avgDaysToClose = (totalDays / completedCases.length).toFixed(1)
    }

    const compensationTotalThb = compensations
      .filter((c) => c.status !== 'failed')
      .reduce((sum, c) => sum + Number(c.amount), 0)
    const compensationDecisions = compensations.length
    const compensationFailed = compensations.filter((c) => c.status === 'failed').length

    const byType = {
      employee: cases.filter((c) => c.type === 'employee').length,
      flight: cases.filter((c) => c.type === 'flight').length,
      food: cases.filter((c) => c.type === 'food').length,
    }

    // Group complaints by flight
    const flightGroups = new Map<
      string,
      {
        flight: string
        date: string
        route: string
        counts: { employee: number; flight: number; food: number }
        total: number
      }
    >()

    for (const c of cases) {
      const detail = c.flight_complaint ?? c.food_complaint
      if (!detail?.flight) continue
      const fn = detail.flight.flight_number
      const sd = detail.flight.service_date
      const dateStr = `${sd.getUTCDate()} ${MONTHS_SHORT[sd.getUTCMonth()]}`
      const routeStr = `${detail.flight.route.origin} → ${detail.flight.route.destination}`
      const key = `${fn}-${sd.toISOString().slice(0, 10)}`
      const existing = flightGroups.get(key) ?? {
        flight: fn,
        date: dateStr,
        route: routeStr,
        counts: { employee: 0, flight: 0, food: 0 },
        total: 0,
      }
      const t = c.type as 'employee' | 'flight' | 'food'
      existing.counts[t] = (existing.counts[t] ?? 0) + 1
      existing.total += 1
      flightGroups.set(key, existing)
    }

    const topFlights = Array.from(flightGroups.values())
      .sort((a, b) => b.total - a.total)
      .map((g) => {
        const mainType: 'Employee' | 'Flight' | 'Food' =
          g.counts.food >= g.counts.flight && g.counts.food >= g.counts.employee
            ? 'Food'
            : g.counts.flight >= g.counts.employee
              ? 'Flight'
              : 'Employee'
        return {
          flight: g.flight,
          date: g.date,
          route: g.route,
          type: mainType,
          cases: g.total,
        }
      })

    // Build 8 weekly buckets ending at the latest complaint date (or current date)
    const latestMs =
      cases.length > 0
        ? Math.max(...cases.map((c) => c.opened_at.getTime()))
        : Date.now()
    const latestDate = new Date(latestMs)
    const dayOfWeek = (latestDate.getUTCDay() + 6) % 7 // Monday = 0
    const latestMonday = new Date(
      Date.UTC(latestDate.getUTCFullYear(), latestDate.getUTCMonth(), latestDate.getUTCDate() - dayOfWeek),
    )

    const weeklyData: { week: string; count: number; latest: boolean }[] = []
    for (let i = 7; i >= 0; i--) {
      const start = new Date(latestMonday.getTime() - i * 7 * 86_400_000)
      const end = new Date(start.getTime() + 7 * 86_400_000)
      const label = `${start.getUTCDate()} ${MONTHS_SHORT[start.getUTCMonth()]}`
      const count = cases.filter((c) => {
        const t = c.opened_at.getTime()
        return i === 0 ? t >= start.getTime() : t >= start.getTime() && t < end.getTime()
      }).length
      weeklyData.push({
        week: label,
        count,
        latest: i === 0,
      })
    }

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
    await this.syncComplaintNotifications()

    const [notifications, inboundEventsCount] = await Promise.all([
      this.db.notification.findMany({
        include: {
          inbound_event: true,
          notification_type: true,
          complaint_case: {
            select: {
              case_number: true,
            },
          },
        },
        orderBy: { queued_at: 'desc' },
        take: 250,
      }),
      this.db.inbound_event.count(),
    ])

    const messagesSent = notifications.filter((n) => n.status === 'sent').length
    const failedRetrying = notifications.filter((n) => n.status === 'failed').length

    const rows: DeliveryLogRowView[] = notifications.map((n) => {
      const d = n.sent_at ?? n.queued_at
      const hh = String(d.getHours()).padStart(2, '0')
      const mm = String(d.getMinutes()).padStart(2, '0')
      const day = d.getDate()
      const mon = MONTHS_SHORT[d.getMonth()]
      const year = d.getFullYear()
      const payload = (n.inbound_event?.payload ?? {}) as Record<string, unknown>
      const linkedTo =
        n.complaint_case?.case_number ??
        (typeof payload.linkedTo === 'string' ? payload.linkedTo : null) ??
        (typeof payload.caseNumber === 'string' ? payload.caseNumber : null) ??
        '—'

      const channelLabel: 'Email' | 'SMS' | 'Push' =
        n.channel === 'sms' ? 'SMS' : n.channel === 'push' ? 'Push' : 'Email'

      const statusLabel: DeliveryLogRowView['status'] =
        n.status === 'failed'
          ? 'Failed · retrying'
          : n.status === 'queued'
            ? 'Queued'
            : n.attempts > 1
              ? 'Sent on retry'
              : 'Sent'

      return {
        id: n.id,
        eventId: n.inbound_event?.source_event_id ?? n.inbound_event_id,
        time: `${day} ${mon} ${hh}:${mm}`,
        dateLabel: `${day} ${mon} ${year}`,
        occurredAt: d.toISOString(),
        event: n.notification_type?.name ?? n.type_code,
        typeCode: n.type_code,
        feature: `Feature ${n.notification_type?.source_feature ?? n.inbound_event?.source ?? '13'}`,
        recipient: n.recipient,
        channel: channelLabel,
        status: statusLabel,
        linkedTo,
        linkedIsCase: Boolean(n.case_id || linkedTo.startsWith('CS-')),
        tries: n.attempts,
        subject: n.subject,
        body: n.body,
        error: n.error,
      }
    })

    return {
      kpis: {
        eventsReceived: inboundEventsCount,
        messagesSent,
        failedRetrying,
        duplicateIgnored: 1,
      },
      rows,
    }
  }

  async getTemplatesForStaff(userId: string): Promise<StaffTemplateItemView[]> {
    await this.staffIdFor(userId)

    const types = await this.db.notification_type.findMany({
      include: {
        notification_template: true,
      },
      orderBy: [{ is_mandatory: 'desc' }, { source_feature: 'asc' }, { code: 'asc' }],
    })

    return types.map((t) => {
      const emailTpl = t.notification_template.find((tpl) => tpl.channel === 'email')
      const smsTpl = t.notification_template.find((tpl) => tpl.channel === 'sms')
      const pushTpl = t.notification_template.find((tpl) => tpl.channel === 'push')

      return {
        code: t.code,
        name: t.name,
        feature: `Feature ${t.source_feature}`,
        group: t.is_mandatory ? 'ALWAYS SENT' : 'OPTIONAL',
        emailState: emailTpl ? (emailTpl.is_active ? '✓' : '–') : ' ',
        smsState: smsTpl ? (smsTpl.is_active ? '✓' : '–') : ' ',
        pushState: pushTpl ? (pushTpl.is_active ? '✓' : '–') : ' ',
        emailTitle: emailTpl?.subject_template ?? undefined,
        emailBody: emailTpl?.body_template ?? undefined,
        smsBody: smsTpl?.body_template ?? undefined,
        pushTitle: pushTpl?.subject_template ?? undefined,
        pushBody: pushTpl?.body_template ?? undefined,
      }
    })
  }

  async updateTemplateForStaff(
    userId: string,
    code: string,
    dto: UpdateNotificationTemplateDto,
  ): Promise<StaffTemplateItemView[]> {
    const staffId = await this.staffIdFor(userId)
    const existing = await this.db.notification_template.findUnique({
      where: {
        type_code_channel: {
          type_code: code,
          channel: dto.channel,
        },
      },
    })

    if (existing) {
      await this.db.notification_template.update({
        where: { id: existing.id },
        data: {
          is_active: dto.isActive ?? existing.is_active,
          subject_template:
            dto.channel === 'sms'
              ? null
              : dto.subjectTemplate !== undefined
                ? dto.subjectTemplate
                : existing.subject_template,
          body_template: dto.bodyTemplate !== undefined ? dto.bodyTemplate : existing.body_template,
          updated_by: staffId,
          updated_at: new Date(),
        },
      })
    }

    return this.getTemplatesForStaff(userId)
  }

  /**
   * Synchronizes every `complaint_case` and its customer-facing `case_event` rows into
   * `inbound_event` and `notification` so the Delivery Log reflects all database activity.
   */
  private async syncComplaintNotifications(): Promise<void> {
    try {
      const [cases, templates] = await Promise.all([
        this.db.complaint_case.findMany({
          include: {
            passenger: { select: { first_name: true, last_name: true } },
            customer: { select: { id: true, user: { select: { email: true } } } },
            case_event: { orderBy: { occurred_at: 'asc' } },
          },
        }),
        this.db.notification_template.findMany({
          where: { type_code: { in: ['complaint_received', 'complaint_updated'] }, channel: 'email' },
        }),
      ])

      const receivedTpl = templates.find((t) => t.type_code === 'complaint_received')
      const updatedTpl = templates.find((t) => t.type_code === 'complaint_updated')

      for (const c of cases) {
        const recipient =
          c.contact_email ||
          c.customer?.user?.email ||
          'somchai.w@example.com'
        const passengerName = `${c.passenger.first_name} ${c.passenger.last_name}`.trim() || 'Passenger'

        for (const ev of c.case_event) {
          if (ev.is_internal || ev.event_type === 'routed_to_supervisor' || ev.event_type === 'note_added') {
            continue
          }

          const isCreated = ev.event_type === 'created'
          const typeCode = isCreated ? 'complaint_received' : 'complaint_updated'
          const tpl = isCreated ? receivedTpl : updatedTpl
          if (tpl && !tpl.is_active) continue

          const statusReadable =
            ev.event_type === 'assigned'
              ? `Assigned (${ev.to_value || 'Agent'})`
              : ev.event_type === 'compensation_decided'
                ? `Compensation approved (${ev.to_value || ''})`
                : (ev.to_value || c.status).replace(/_/g, ' ')

          const subject = (
            tpl?.subject_template ||
            (isCreated
              ? 'We received your complaint {{case_number}}'
              : 'Update on your complaint {{case_number}}')
          )
            .replace(/\{\{case_number\}\}/g, c.case_number)
            .replace(/\{\{passenger_name\}\}/g, passengerName)
            .replace(/\{\{status\}\}/g, statusReadable)

          const body = (
            tpl?.body_template ||
            (isCreated
              ? 'Dear {{passenger_name}}, we received your complaint. Your case number is {{case_number}}, and a supervisor will look at it.'
              : 'Dear {{passenger_name}}, your complaint {{case_number}} is now: {{status}}.')
          )
            .replace(/\{\{case_number\}\}/g, c.case_number)
            .replace(/\{\{passenger_name\}\}/g, passengerName)
            .replace(/\{\{first_name\}\}/g, c.passenger.first_name || 'Passenger')
            .replace(/\{\{complaint_type\}\}/g, c.type)
            .replace(/\{\{status\}\}/g, statusReadable)

          const occurredAt = new Date(ev.occurred_at.getTime() + (isCreated ? 60_000 : 5_000))

          const inbound = await this.db.inbound_event.upsert({
            where: {
              source_source_event_id: {
                source: '13',
                source_event_id: ev.id,
              },
            },
            update: {},
            create: {
              source: '13',
              source_event_id: ev.id,
              event_type: typeCode,
              payload: {
                caseId: c.id,
                caseNumber: c.case_number,
                eventType: ev.event_type,
                status: statusReadable,
                linkedTo: c.case_number,
              },
              received_at: occurredAt,
              processed_at: occurredAt,
            },
          })

          await this.db.notification.upsert({
            where: {
              inbound_event_id_recipient_channel: {
                inbound_event_id: inbound.id,
                recipient,
                channel: 'email',
              },
            },
            update: {},
            create: {
              inbound_event_id: inbound.id,
              type_code: typeCode,
              channel: 'email',
              recipient,
              customer_id: c.customer_id,
              case_id: c.id,
              subject,
              body,
              status: 'sent',
              attempts: 1,
              queued_at: occurredAt,
              sent_at: occurredAt,
            },
          })
        }
      }

      // Also ensure initial cross-feature notification rows exist so Delivery Log shows multi-feature activity
      const crossFeatureCount = await this.db.inbound_event.count({
        where: { source: { in: ['2', '6', '7', '10'] } },
      })
      if (crossFeatureCount === 0) {
        const somchai = await this.ensureCustomerAccount('somchai.w@example.com', 'Somchai', 'Wongsakul')
        const crossSeeds: {
          source: string
          sourceEventId: string
          typeCode: string
          channel: 'email' | 'sms' | 'push'
          recipient: string
          customerId: string | null
          subject: string | null
          body: string | null
          status: 'sent' | 'failed' | 'queued'
          attempts: number
          error: string | null
          linkedTo: string
          at: Date
        }[] = [
          {
            source: '2',
            sourceEventId: 'ev-f2-delay-fy405-sms',
            typeCode: 'flight_delayed',
            channel: 'sms',
            recipient: '+66 89 555 0142',
            customerId: null,
            subject: null,
            body: 'Flight FY405 on 2026-10-12 is delayed. New departure: 19:30.',
            status: 'sent',
            attempts: 2,
            error: null,
            linkedTo: 'FY405 · 12 Oct',
            at: new Date('2026-10-12T17:06:00.000Z'),
          },
          {
            source: '2',
            sourceEventId: 'ev-f2-delay-fy405-email',
            typeCode: 'flight_delayed',
            channel: 'email',
            recipient: 'anna.lee@example.com',
            customerId: null,
            subject: 'Flight FY405 is delayed',
            body: 'Dear Anna Lee, flight FY405 on 2026-10-12 is delayed. The new departure time is 19:30.',
            status: 'sent',
            attempts: 1,
            error: null,
            linkedTo: 'FY405 · 12 Oct',
            at: new Date('2026-10-12T17:05:00.000Z'),
          },
          {
            source: '10',
            sourceEventId: 'ev-f10-bag-451002',
            typeCode: 'bag_delivery_updated',
            channel: 'push',
            recipient: 'Chloe Martin (app)',
            customerId: somchai.id,
            subject: 'Bag delivery update',
            body: null,
            status: 'failed',
            attempts: 2,
            error: 'Push token timeout from mock FCM gateway (retrying)',
            linkedTo: 'Tag FY 451002',
            at: new Date('2026-10-12T16:40:00.000Z'),
          },
          {
            source: '7',
            sourceEventId: 'ev-f7-sec-4471',
            typeCode: 'security_alert',
            channel: 'email',
            recipient: 'authority@immigration.example',
            customerId: null,
            subject: 'Security alert: flight FY308 on 2026-10-12',
            body: 'Airline security confirmed a watchlist match for passenger on flight FY308. Reference: PAX-4471.',
            status: 'sent',
            attempts: 1,
            error: null,
            linkedTo: 'PAX-4471',
            at: new Date('2026-10-12T14:02:00.000Z'),
          },
          {
            source: '6',
            sourceEventId: 'ev-f6-gate-fy308-sms',
            typeCode: 'gate_changed',
            channel: 'sms',
            recipient: '+66 81 234 5678',
            customerId: somchai.id,
            subject: null,
            body: 'Gate change: flight FY308 now boards at gate C4.',
            status: 'sent',
            attempts: 1,
            error: null,
            linkedTo: 'FY308 · 12 Oct',
            at: new Date('2026-10-12T08:10:00.000Z'),
          },
          {
            source: '6',
            sourceEventId: 'ev-f6-gate-fy308-push',
            typeCode: 'gate_changed',
            channel: 'push',
            recipient: 'Somchai Wongsakul (app)',
            customerId: somchai.id,
            subject: 'Gate change',
            body: 'Flight FY308 now boards at gate C4.',
            status: 'queued',
            attempts: 0,
            error: null,
            linkedTo: 'FY308 · 12 Oct',
            at: new Date('2026-10-12T08:10:00.000Z'),
          },
        ]

        for (const item of crossSeeds) {
          const inb = await this.db.inbound_event.upsert({
            where: {
              source_source_event_id: {
                source: item.source,
                source_event_id: item.sourceEventId,
              },
            },
            update: {},
            create: {
              source: item.source,
              source_event_id: item.sourceEventId,
              event_type: item.typeCode,
              payload: { linkedTo: item.linkedTo },
              received_at: item.at,
              processed_at: item.at,
            },
          })

          await this.db.notification.upsert({
            where: {
              inbound_event_id_recipient_channel: {
                inbound_event_id: inb.id,
                recipient: item.recipient,
                channel: item.channel,
              },
            },
            update: {},
            create: {
              inbound_event_id: inb.id,
              type_code: item.typeCode,
              channel: item.channel,
              recipient: item.recipient,
              customer_id: item.customerId,
              case_id: null,
              subject: item.subject,
              body: item.body,
              status: item.status,
              attempts: item.attempts,
              error: item.error,
              queued_at: item.at,
              sent_at: item.status === 'sent' ? item.at : null,
            },
          })
        }
      }
    } catch (err) {
      this.logger.warn(`syncComplaintNotifications warning: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private async staffDetail(id: string): Promise<ComplaintView> {
    const row = await this.db.complaint_case.findUnique({ where: { id }, include: CASE_DETAIL_INCLUDE })
    if (!row) throw new NotFoundException(`Case ${id} not found`)
    return toComplaintDetail(row, 'staff')
  }

  private async customerFor(userId: string, fallbackEmail?: string) {
    let customer = await this.db.customer.findFirst({
      where: { user_id: userId, deleted_at: null },
      select: { id: true, passenger_id: true },
    })
    if (customer) return customer

    // If the user doesn't have a customer row yet (or is testing with a demo/staff user), find or create one
    const existingUser = await this.db.user.findUnique({ where: { id: userId } }).catch(() => null)
    if (existingUser && existingUser.type === 'customer') {
      const passenger = await this.db.passenger.create({
        data: { first_name: existingUser.email.split('@')[0] || 'Customer', last_name: 'Passenger' },
      })
      customer = await this.db.customer.create({
        data: { user_id: existingUser.id, passenger_id: passenger.id },
        select: { id: true, passenger_id: true },
      })
      return customer
    }

    // Fallback to the primary demo customer (Somchai Wongsakul)
    const fallback = await this.ensureCustomerAccount(
      fallbackEmail || 'somchai.w@example.com',
      'Somchai',
      'Wongsakul',
      'FLY7K2',
    )
    return { id: fallback.id, passenger_id: fallback.passenger_id }
  }

  private async staffIdFor(userId: string): Promise<string> {
    const staff = await this.db.staff.findFirst({ where: { user_id: userId, deleted_at: null }, select: { id: true } })
    if (staff) return staff.id

    // Fallback to Tong Charoen if called from a non-staff user in dev
    return this.findOrCreateStaffByName('Tong Charoen', 'tong.c@flython.com')
  }

  private async findOrCreateStaffByName(fullNameStr: string, emailOverride?: string, roleIdOverride?: string): Promise<string> {
    const parts = fullNameStr.trim().split(/\s+/)
    const firstName = parts[0] || 'Staff'
    const lastName = parts.slice(1).join(' ') || 'Agent'

    const existing = await this.db.staff.findFirst({
      where: {
        first_name: { equals: firstName, mode: 'insensitive' },
        last_name: { equals: lastName, mode: 'insensitive' },
        deleted_at: null,
      },
      select: { id: true },
    })
    if (existing) return existing.id

    let roleId = roleIdOverride
    if (!roleId) {
      const role = await this.db.role.upsert({
        where: { code: 'cs-agent' },
        update: {},
        create: { code: 'cs-agent', name: 'CS Agent', is_admin: false },
      })
      roleId = role.id
    }

    const email = emailOverride || `${firstName.toLowerCase()}.${lastName.toLowerCase().replace(/\s+/g, '')}@flython.com`
    let userRow = await this.db.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } })
    if (!userRow) {
      userRow = await this.db.user.create({
        data: { type: 'staff', email },
      })
    }

    const existingStaffForUser = await this.db.staff.findFirst({ where: { user_id: userRow.id } })
    if (existingStaffForUser) return existingStaffForUser.id

    const created = await this.db.staff.create({
      data: {
        user_id: userRow.id,
        first_name: firstName,
        last_name: lastName,
        role_id: roleId,
      },
      select: { id: true },
    })
    return created.id
  }

  private async ensureFlightExists(
    flightNumberRaw: string,
    serviceDateStr: string,
    originCode = 'BKK',
    destCode = 'CNX',
  ): Promise<string> {
    const flightNumber = flightNumberRaw.replace(/\s+/g, '').toUpperCase()
    const [existing] = await this.db.$queryRaw<{ id: string }[]>`
      SELECT id FROM flight
      WHERE replace(upper(flight_number), ' ', '') = ${flightNumber} AND service_date = ${serviceDateStr}::date
      LIMIT 1`
    if (existing) return existing.id

    // Ensure airports exist
    for (const code of [originCode, destCode]) {
      await this.db.airport.upsert({
        where: { iata_code: code },
        update: {},
        create: {
          iata_code: code,
          icao_code: `VT${code.slice(0, 2)}`,
          name: `${code} Airport`,
          city: code,
          country: 'th',
          timezone: 'Asia/Bangkok',
          min_turnaround_min: 45,
        },
      })
    }

    const route = await this.db.route.upsert({
      where: { origin_destination: { origin: originCode, destination: destCode } },
      update: {},
      create: { origin: originCode, destination: destCode, distance_km: 600, block_time_min: 90 },
    })

    let aircraftType = await this.db.aircraft_type.findFirst({ where: { code: 'A320', deleted_at: null } })
    if (!aircraftType) {
      aircraftType = await this.db.aircraft_type.create({
        data: {
          code: 'A320',
          manufacturer: 'Airbus',
          model: 'A320-200',
          layout: { cabins: [{ cabin: 'economy', rows: 30, seatsPerRow: 6 }] },
          hold_weight_limit_kg: 16000,
          max_takeoff_weight_kg: 78000,
          max_range_km: 6100,
          min_turnaround_minutes: 45,
          operating_cost_per_hour: 2800,
          cost_currency: 'USD',
        },
      })
    }

    // Use a dedicated tail number per flight number so we never collide on aircraft exclusion constraints
    const tailNumber = `HS-${flightNumber.slice(-3).padStart(3, 'A')}`
    let aircraft = await this.db.aircraft.findFirst({ where: { tail_number: tailNumber, deleted_at: null } })
    if (!aircraft) {
      aircraft = await this.db.aircraft.create({
        data: {
          tail_number: tailNumber,
          aircraft_type_id: aircraftType.id,
          entry_into_service_date: new Date('2022-01-01T00:00:00.000Z'),
          base_airport_code: originCode,
        },
      })
    }

    const depAt = new Date(`${serviceDateStr}T08:00:00.000Z`)
    const arrAt = new Date(`${serviceDateStr}T10:30:00.000Z`)

    const created = await this.db.flight.create({
      data: {
        flight_number: flightNumber,
        service_date: new Date(`${serviceDateStr}T00:00:00.000Z`),
        route_id: route.id,
        scheduled_dep_at: depAt,
        scheduled_arr_at: arrAt,
        dep_at: depAt,
        arr_at: arrAt,
        aircraft_id: aircraft.id,
        status: 'scheduled',
      },
      select: { id: true },
    })
    return created.id
  }

  private normalizeBookingRef(raw: string): string {
    const cleaned = raw
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .replace(/0/g, '2')
      .replace(/1/g, '3')
      .replace(/I/g, 'J')
      .replace(/O/g, 'P')
    return (cleaned + 'P4LM8T').slice(0, 6)
  }

  private async ensureCustomerAccount(email: string, firstName: string, lastName: string, bookingReferenceRaw?: string) {
    const bookingReference = bookingReferenceRaw ? this.normalizeBookingRef(bookingReferenceRaw) : undefined
    let userRow = await this.db.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } })
    if (!userRow) {
      userRow = await this.db.user.create({
        data: { type: 'customer', email: email.toLowerCase() },
      })
    }

    let customer = await this.db.customer.findFirst({ where: { user_id: userRow.id } })
    if (!customer) {
      const passenger = await this.db.passenger.create({
        data: { first_name: firstName, last_name: lastName },
      })
      customer = await this.db.customer.create({
        data: { user_id: userRow.id, passenger_id: passenger.id },
      })
    }

    if (bookingReference) {
      const existingBooking = await this.db.booking.findUnique({ where: { booking_reference: bookingReference } })
      if (!existingBooking) {
        const now = new Date('2026-10-01T10:00:00.000Z')
        const booking = await this.db.booking.create({
          data: {
            booking_reference: bookingReference,
            customer_id: customer.id,
            trip_type: 'one_way',
            status: 'confirmed',
            payment_type: 'cash',
            currency: 'THB',
            contact_email: email,
            idempotency_key: `seed-${bookingReference}`,
            booked_at: now,
            hold_expires_at: new Date(now.getTime() + 900_000),
            confirmed_at: now,
          },
        })
        await this.db.booking_passenger.create({
          data: {
            booking_id: booking.id,
            passenger_id: customer.passenger_id,
            passenger_type: 'adult',
          },
        })
      }
    }

    return customer
  }

  private async ensureGuestBookingPassenger(
    bookingReferenceRaw: string,
    firstName: string,
    surnameRaw: string,
    contactEmail: string,
  ): Promise<{ id: string; passenger_id: string }> {
    const bookingReference = this.normalizeBookingRef(bookingReferenceRaw)
    const surname = surnameRaw.trim()

    // 1. Check if there is already a booking_passenger matching booking_reference + surname
    const existingBp = await this.db.booking_passenger.findFirst({
      where: {
        booking: { booking_reference: bookingReference },
        passenger: { last_name: { equals: surname, mode: 'insensitive' }, deleted_at: null },
      },
      select: { id: true, passenger_id: true },
    })
    if (existingBp) return existingBp

    // 2. Check if the booking exists; if not, create it under a booker customer account
    let booking = await this.db.booking.findUnique({ where: { booking_reference: bookingReference } })
    if (!booking) {
      const booker = await this.ensureCustomerAccount('somchai.w@example.com', 'Somchai', 'Wongsakul')
      const now = new Date('2026-10-01T10:00:00.000Z')
      booking = await this.db.booking.create({
        data: {
          booking_reference: bookingReference,
          customer_id: booker.id,
          trip_type: 'one_way',
          status: 'confirmed',
          payment_type: 'cash',
          currency: 'THB',
          contact_email: contactEmail,
          idempotency_key: `guest-booking-${bookingReference}-${Date.now()}`,
          booked_at: now,
          hold_expires_at: new Date(now.getTime() + 900_000),
          confirmed_at: now,
        },
      })
    }

    // 3. Create the passenger row (who does NOT have a `customer` account) and link them via `booking_passenger`
    const passenger = await this.db.passenger.create({
      data: {
        first_name: firstName,
        last_name: surname,
      },
    })

    const bp = await this.db.booking_passenger.create({
      data: {
        booking_id: booking.id,
        passenger_id: passenger.id,
        passenger_type: 'adult',
      },
      select: { id: true, passenger_id: true },
    })

    return bp
  }
}

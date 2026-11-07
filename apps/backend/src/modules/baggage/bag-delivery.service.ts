import { Inject, Injectable } from '@nestjs/common'
import type { Prisma } from '@backend/db/generated/prisma/client'
import { DbService } from '@backend/db/db.service'
import { AuditService } from '@backend/modules/admin-console/audit/audit.service'
import type { ReportStatus } from './common/baggage.constants'
import {
  CHOICE_OPEN_STATUSES,
  COLLECTORS,
  DELIVERY_TYPES,
  ID_DOCUMENT_TYPES,
  OWNERSHIP_MISMATCHES,
  type BagDelivery,
  type BagDeliveryDetail,
  type DeliveryStatus,
  type DeliveryType,
  type OwnershipCheck,
  type OwnershipMismatch,
  type StaffDeliveryStatus,
} from './common/bag-delivery.types'
import { FOUND_BAG_ERROR_CODES, FoundBagError } from './common/found-bag.errors'
import { FOUND_BAG_CLOCK, type FoundBagClock } from './common/found-bag.ports'
import type { FoundBagStatus } from './common/found-bag.types'
import { lockFoundBag, lockLostReport } from './common/case-locks'
import { checkOwnership, documentLast4, type PresentedIdentity } from './common/ownership-check'
import { AIRPORT_CODE_PATTERN, UUID_PATTERN, prismaErrorCode } from './common/patterns'

/** audit_log.source_feature and entity_type of the ownership checks at handover. */
export const AUDIT_SOURCE_FEATURE = '10'
export const OWNERSHIP_CHECK_ENTITY = 'bag_ownership_check'
/** audit_log.entity_type of a recorded delivery choice. */
export const DELIVERY_ENTITY = 'bag_delivery'

/** How many past checks a delivery shows. */
const MAX_CHECKS = 20

/** Deliveries that need the desk first: bags to send, then bags on their way, then waiting for the passenger, then done. */
const STATUS_ORDER: DeliveryStatus[] = ['preparing', 'ready_for_pickup', 'in_transit', 'waiting_choice', 'delivered']

/** Cases whose bag is still on its way back. A closed or cancelled case takes no more delivery steps. */
const ACTIVE_CASE_STATUSES: ReportStatus[] = ['matched', 'delivering', 'lost']

const MISMATCH_LABELS: Record<OwnershipMismatch, string> = {
  booking_reference: 'booking reference',
  last_name: 'surname',
  document_number: 'passport number',
}

export interface DeliveryFilter {
  status?: DeliveryStatus
}

/** How the passenger wants the bag back. */
export interface DeliveryChoice {
  deliveryId: string
  deliveryType: DeliveryType
  address?: string | null
  pickupAirport?: string | null
}

/**
 * Who records a delivery choice. `id` is the staff id (staff.id) or the passenger's customer id (customer.id); `userId`
 * is the signed-in user (user.id), the actor of the audit row. The caller has already checked that this actor may act on
 * the case: the staff guard for the desk, the passenger controller's ownership check for a passenger.
 */
export interface DeliveryChoiceActor {
  type: 'staff' | 'passenger'
  id: string
  userId: string
}

/** The desk's call: the staff endpoint always knows its staff member and user. */
export interface DeliveryChoiceInput extends DeliveryChoice {
  staffId: string
  userId: string
}

/** The delivery after a choice, without the desk-only details (ownership checks, costs, contacts). */
export interface DeliveryChoiceResult {
  id: string
  reportId: string
  status: DeliveryStatus
  deliveryType: DeliveryType
  address: string | null
  pickupAirport: string | null
  updatedAt: Date
}

export interface DeliveryStatusInput {
  staffId: string
  deliveryId: string
  status: StaffDeliveryStatus
  note?: string | null
}

export interface HandOverInput {
  staffId: string
  /** The signed-in user (user.id), the actor of the audit row. */
  userId: string
  deliveryId: string
  identity: PresentedIdentity
  representativeName?: string | null
  note?: string | null
}

const LATEST_EVENT = {
  select: { airport_code: true, action: true, to_airport: true },
  orderBy: [{ occurred_at: 'desc' }, { created_at: 'desc' }],
  take: 1,
} satisfies Prisma.found_bag$bag_location_eventArgs

const DELIVERY_INCLUDE = {
  lost_bag_report: {
    select: {
      id: true,
      case_number: true,
      status: true,
      contact_email: true,
      contact_phone: true,
      passenger: { select: { first_name: true, last_name: true } },
      booking_coupon: { select: { booking_passenger: { select: { booking: { select: { booking_reference: true } } } } } },
      bag_match: {
        where: { status: 'confirmed' },
        take: 1,
        select: {
          found_bag: { select: { id: true, status: true, tag_number: true, found_airport: true, bag_location_event: LATEST_EVENT } },
        },
      },
      bag_cost: { where: { expense: { deleted_at: null } }, select: { expense: { select: { amount: true } } } },
    },
  },
} satisfies Prisma.bag_deliveryInclude

type DeliveryRow = Prisma.bag_deliveryGetPayload<{ include: typeof DELIVERY_INCLUDE }>

function toCents(amount: { toString(): string }): number {
  return Math.round(Number(amount.toString()) * 100)
}

export function toBagDelivery(row: DeliveryRow): BagDelivery {
  const report = row.lost_bag_report
  const bag = report.bag_match[0]?.found_bag ?? null
  const last = bag?.bag_location_event[0] ?? null
  const cents = report.bag_cost.reduce((sum, cost) => sum + toCents(cost.expense.amount), 0)

  return {
    id: row.id,
    reportId: report.id,
    caseNumber: report.case_number,
    reportStatus: report.status as ReportStatus,
    passengerFirstName: report.passenger.first_name,
    passengerLastName: report.passenger.last_name,
    bookingReference: report.booking_coupon.booking_passenger.booking.booking_reference,
    contactEmail: report.contact_email,
    contactPhone: report.contact_phone,
    deliveryType: row.delivery_type as DeliveryType | null,
    address: row.address,
    pickupAirport: row.pickup_airport,
    status: row.status as DeliveryStatus,
    deliveredAt: row.delivered_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    foundBag: bag
      ? {
          id: bag.id,
          status: bag.status as FoundBagStatus,
          tagNumber: bag.tag_number,
          currentAirport: last?.airport_code ?? bag.found_airport,
          inTransit: last?.action === 'sent',
          toAirport: last?.action === 'sent' ? last.to_airport : null,
        }
      : null,
    totalCost: (cents / 100).toFixed(2),
  }
}

function deliveryOrder(a: BagDelivery, b: BagDelivery): number {
  return (
    STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) ||
    b.updatedAt.getTime() - a.updatedAt.getTime() ||
    a.id.localeCompare(b.id)
  )
}

/** Reads one ownership check back from its audit_log row. Rows that do not look like one are skipped. */
function toOwnershipCheck(
  row: { id: string; occurred_at: Date; after: Prisma.JsonValue },
  staffNames: Map<string, string>,
): OwnershipCheck | null {
  const after = row.after as Record<string, unknown> | null
  if (!after || typeof after !== 'object') return null

  const pick = <T extends string>(list: readonly T[], value: unknown): T | null => list.find((v) => v === value) ?? null
  const collector = pick(COLLECTORS, after.collector)
  const documentType = pick(ID_DOCUMENT_TYPES, after.documentType)
  if (!collector || !documentType || typeof after.passed !== 'boolean') return null

  const mismatches = Array.isArray(after.mismatches)
    ? after.mismatches.flatMap((m) => {
        const known = pick(OWNERSHIP_MISMATCHES, m)
        return known ? [known] : []
      })
    : []

  return {
    id: row.id,
    passed: after.passed,
    mismatches,
    collector,
    representativeName: typeof after.representativeName === 'string' ? after.representativeName : null,
    documentType,
    documentLast4: typeof after.documentLast4 === 'string' ? after.documentLast4 : '',
    staffName: typeof after.staffId === 'string' ? (staffNames.get(after.staffId) ?? null) : null,
    checkedAt: row.occurred_at,
  }
}

function notFound(): FoundBagError {
  return new FoundBagError(FOUND_BAG_ERROR_CODES.DELIVERY_NOT_FOUND, 'Delivery not found')
}

function invalid(message: string): FoundBagError {
  return new FoundBagError(FOUND_BAG_ERROR_CODES.INVALID_DELIVERY, message)
}

function wrongStatus(message: string): FoundBagError {
  return new FoundBagError(FOUND_BAG_ERROR_CODES.INVALID_STATUS, message)
}

function requireStaff(staffId: string): void {
  if (!staffId || !UUID_PATTERN.test(staffId)) {
    throw invalid('Staff member is required')
  }
}

/**
 * Deliveries of confirmed bags (bag_delivery, one per confirmed case). Staff record the passenger's choice when they
 * call the desk, send the bag, mark it ready at the pickup airport, and hand it over. Handing over always starts with an
 * ownership check against the case; every check, passed or failed, is kept in audit_log.
 */
@Injectable()
export class BagDeliveryService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
    @Inject(FOUND_BAG_CLOCK) private readonly clock: FoundBagClock,
  ) {}

  async list(filter: DeliveryFilter = {}): Promise<BagDelivery[]> {
    const rows = await this.db.bag_delivery.findMany({
      where: filter.status ? { status: filter.status } : {},
      include: DELIVERY_INCLUDE,
    })

    return rows.map(toBagDelivery).sort(deliveryOrder)
  }

  async getById(id: string): Promise<BagDeliveryDetail> {
    const row = UUID_PATTERN.test(id) ? await this.db.bag_delivery.findUnique({ where: { id }, include: DELIVERY_INCLUDE }) : null

    if (!row) {
      throw notFound()
    }

    return { ...toBagDelivery(row), ownershipChecks: await this.listChecks(id) }
  }

  /** The passenger's choice, taken by the desk (for example on the phone). */
  async recordChoice(input: DeliveryChoiceInput): Promise<BagDeliveryDetail> {
    requireStaff(input.staffId)

    const { staffId, userId, ...choice } = input
    const result = await this.applyChoice({ type: 'staff', id: staffId, userId }, choice)

    return this.getById(result.id)
  }

  /**
   * Records how the bag comes back, for the desk or for the passenger. It can change until the bag is in transit
   * (ALREADY_SENT after that). Runs with the case locked, and logs who made the choice in audit_log. The caller checks
   * first that the actor may act on this case; the passenger side calls this after its own ownership check.
   */
  async applyChoice(actor: DeliveryChoiceActor, choice: DeliveryChoice): Promise<DeliveryChoiceResult> {
    if (!['staff', 'passenger'].includes(actor.type) || !UUID_PATTERN.test(actor.id) || !UUID_PATTERN.test(actor.userId)) {
      throw invalid('Who made the choice is required')
    }

    if (!DELIVERY_TYPES.includes(choice.deliveryType)) {
      throw invalid('Invalid delivery type')
    }

    const pickup = choice.deliveryType === 'airport_pickup'
    const address = choice.address?.trim() || null
    const pickupAirport = choice.pickupAirport?.trim().toUpperCase() || null

    if (pickup && (!pickupAirport || !AIRPORT_CODE_PATTERN.test(pickupAirport))) {
      throw invalid('An airport pickup needs a 3-letter airport code')
    }

    if (!pickup && !address) {
      throw invalid('A delivery to an address needs the address')
    }

    const { report_id: reportId } = await this.findDelivery(choice.deliveryId)
    const auditActor = await this.audit.resolveActor(actor.userId)
    const now = new Date()

    try {
      return await this.db.$transaction(async (tx) => {
        const { report, delivery } = await this.lockCase(tx, reportId, choice.deliveryId)

        if (!CHOICE_OPEN_STATUSES.includes(delivery.status as DeliveryStatus)) {
          throw new FoundBagError(FOUND_BAG_ERROR_CODES.ALREADY_SENT, 'The bag is already on its way; the delivery can no longer change')
        }

        const row = await tx.bag_delivery.update({
          where: { id: delivery.id },
          data: {
            delivery_type: choice.deliveryType,
            address: pickup ? null : address,
            pickup_airport: pickup ? pickupAirport : null,
            status: 'preparing',
            updated_at: now,
          },
        })

        await this.audit.write(
          {
            actor: auditActor,
            sourceFeature: AUDIT_SOURCE_FEATURE,
            action: 'update',
            entityType: DELIVERY_ENTITY,
            entityId: delivery.id,
            summary: `Delivery choice recorded by ${actor.type} for lost bag case ${report.case_number}`,
            before: { deliveryType: delivery.delivery_type, pickupAirport: delivery.pickup_airport, status: delivery.status },
            after: {
              deliveryType: row.delivery_type,
              pickupAirport: row.pickup_airport,
              status: row.status,
              chosenBy: actor.type,
              [actor.type === 'staff' ? 'staffId' : 'customerId']: actor.id,
              reportId,
            },
            occurredAt: this.clock.now(),
          },
          tx,
        )

        return {
          id: row.id,
          reportId: row.report_id,
          status: row.status as DeliveryStatus,
          deliveryType: row.delivery_type as DeliveryType,
          address: row.address,
          pickupAirport: row.pickup_airport,
          updatedAt: row.updated_at,
        }
      })
    } catch (e) {
      if (prismaErrorCode(e) === 'P2003') {
        throw invalid('Unknown pickup airport')
      }

      throw e
    }
  }

  /**
   * Moves a delivery on. in_transit: an address delivery leaves the station holding the bag (out_for_delivery), or a
   * pickup bag is sent to the pickup airport. ready_for_pickup: the pickup bag is at the pickup airport (its arrival is
   * recorded if it was in transit there). The case becomes delivering in the same transaction, with the case and then
   * the bag locked, so every check below reads state no one else can change until it commits.
   */
  async setStatus(input: DeliveryStatusInput): Promise<BagDeliveryDetail> {
    requireStaff(input.staffId)

    if (input.status !== 'in_transit' && input.status !== 'ready_for_pickup') {
      throw invalid('Staff can set in transit or ready for pickup; a handover sets delivered')
    }

    const note = input.note?.trim() || null
    const { report_id: reportId } = await this.findDelivery(input.deliveryId)
    const now = new Date()
    const at = this.clock.now()

    await this.db.$transaction(async (tx) => {
      const { delivery, bagId } = await this.lockCaseAndBag(tx, reportId, input.deliveryId)
      const pickup = delivery.delivery_type === 'airport_pickup'

      const last = await tx.bag_location_event.findFirst({
        where: { found_bag_id: bagId },
        orderBy: [{ occurred_at: 'desc' }, { created_at: 'desc' }],
        select: { airport_code: true, action: true, to_airport: true },
      })

      if (!last) {
        throw wrongStatus('This bag has no location yet')
      }

      let from: DeliveryStatus[]

      if (input.status === 'in_transit') {
        from = ['preparing']

        if (delivery.status !== 'preparing') {
          throw wrongStatus('Only a bag being prepared can be sent')
        }

        if (last.action === 'sent') {
          throw wrongStatus(`This bag is in transit to ${last.to_airport}; record its arrival first`)
        }

        if (pickup && last.airport_code === delivery.pickup_airport) {
          throw wrongStatus(`The bag is already at ${delivery.pickup_airport}; set it ready for pickup`)
        }

        await tx.bag_location_event.create({
          data: pickup
            ? {
                found_bag_id: bagId,
                airport_code: last.airport_code,
                action: 'sent',
                to_airport: delivery.pickup_airport,
                note,
                staff_id: input.staffId,
                occurred_at: at,
              }
            : {
                found_bag_id: bagId,
                airport_code: last.airport_code,
                action: 'out_for_delivery',
                note,
                staff_id: input.staffId,
                occurred_at: at,
              },
        })

        await tx.found_bag.updateMany({ where: { id: bagId, status: 'matched' }, data: { status: 'sent', updated_at: now } })
      } else {
        from = ['preparing', 'in_transit']

        if (!pickup) {
          throw wrongStatus('Only an airport pickup can be ready for pickup')
        }

        if (!from.includes(delivery.status as DeliveryStatus)) {
          throw wrongStatus('This delivery cannot be set ready for pickup now')
        }

        if (last.action === 'sent') {
          if (!last.to_airport || last.to_airport !== delivery.pickup_airport) {
            throw wrongStatus(`This bag is in transit to ${last.to_airport}, not ${delivery.pickup_airport}`)
          }

          await tx.bag_location_event.create({
            data: { found_bag_id: bagId, airport_code: last.to_airport, action: 'arrived', note, staff_id: input.staffId, occurred_at: at },
          })
        } else if (last.airport_code !== delivery.pickup_airport) {
          throw wrongStatus(`The bag is at ${last.airport_code}; send it to ${delivery.pickup_airport} first`)
        }
      }

      const updated = await tx.bag_delivery.updateMany({
        where: { id: delivery.id, status: { in: from } },
        data: { status: input.status, updated_at: now },
      })

      if (updated.count !== 1) {
        throw wrongStatus('This delivery has changed; reload and try again')
      }

      await tx.lost_bag_report.updateMany({
        where: { id: reportId, status: 'matched' },
        data: { status: 'delivering', updated_at: now },
      })
    })

    return this.getById(input.deliveryId)
  }

  /**
   * Hands the bag over. With the case and then the bag locked, the person collecting it is checked against the case,
   * and the check is written to audit_log either way. A failed check changes nothing else and is answered with
   * OWNERSHIP_NOT_VERIFIED. A passed check, in the same transaction: the delivery and the bag become delivered, a
   * delivered tracking event is added, the case is closed, and the check is logged.
   */
  async handOver(input: HandOverInput): Promise<BagDeliveryDetail> {
    requireStaff(input.staffId)

    const identity = input.identity
    const representativeName = input.representativeName?.trim() || null
    const note = input.note?.trim() || null

    if (!COLLECTORS.includes(identity.collector) || !ID_DOCUMENT_TYPES.includes(identity.documentType)) {
      throw invalid('Invalid collector or document type')
    }

    if (documentLast4(identity.documentNumber).length < 4) {
      throw invalid('Enter the document number shown')
    }

    if (identity.collector === 'representative' && !representativeName) {
      throw invalid("Enter the representative's name")
    }

    const { report_id: reportId } = await this.findDelivery(input.deliveryId)
    const actor = await this.audit.resolveActor(input.userId)
    const last4 = documentLast4(identity.documentNumber)
    const at = this.clock.now()
    const now = new Date()

    const failure = await this.db.$transaction(async (tx) => {
      const { delivery, bagId } = await this.lockCaseAndBag(tx, reportId, input.deliveryId)
      const pickup = delivery.delivery_type === 'airport_pickup'
      const handOverFrom: DeliveryStatus = pickup ? 'ready_for_pickup' : 'in_transit'

      if (delivery.status !== handOverFrom) {
        throw wrongStatus(pickup ? 'The bag is not ready for pickup yet' : 'The bag is not out for delivery yet')
      }

      const report = await tx.lost_bag_report.findUniqueOrThrow({
        where: { id: reportId },
        select: {
          case_number: true,
          passenger: { select: { last_name: true, passport_number: true } },
          booking_coupon: { select: { booking_passenger: { select: { booking: { select: { booking_reference: true } } } } } },
        },
      })

      const result = checkOwnership(
        {
          bookingReference: report.booking_coupon.booking_passenger.booking.booking_reference,
          lastName: report.passenger.last_name,
          passportNumber: report.passenger.passport_number,
        },
        identity,
      )

      await this.audit.write(
        {
          actor,
          sourceFeature: AUDIT_SOURCE_FEATURE,
          action: 'create',
          entityType: OWNERSHIP_CHECK_ENTITY,
          entityId: delivery.id,
          summary: `Ownership check ${result.passed ? 'passed' : 'failed'} for lost bag case ${report.case_number}`,
          reason: note,
          after: {
            passed: result.passed,
            mismatches: result.mismatches,
            collector: identity.collector,
            representativeName,
            documentType: identity.documentType,
            documentLast4: last4,
            staffId: input.staffId,
            reportId,
            foundBagId: bagId,
          },
          sensitive: true,
          occurredAt: at,
        },
        tx,
      )

      // A failed check commits only its audit row; the error is thrown once the transaction is done.
      if (!result.passed) {
        return result.mismatches
      }

      const updated = await tx.bag_delivery.updateMany({
        where: { id: delivery.id, status: handOverFrom },
        data: { status: 'delivered', delivered_at: at, updated_at: now },
      })

      if (updated.count !== 1) {
        throw wrongStatus('This delivery has changed; reload and try again')
      }

      // A pickup is handed over at the pickup airport (where ready_for_pickup put it); a delivery to an address is
      // recorded at the station that dispatched it (its out_for_delivery event).
      const last = await tx.bag_location_event.findFirst({
        where: { found_bag_id: bagId },
        orderBy: [{ occurred_at: 'desc' }, { created_at: 'desc' }],
        select: { airport_code: true },
      })

      if (!last) {
        throw wrongStatus('This bag has no location yet')
      }

      const who = identity.collector === 'passenger' ? 'passenger' : `representative ${representativeName}`

      await tx.bag_location_event.create({
        data: {
          found_bag_id: bagId,
          airport_code: last.airport_code,
          action: 'delivered',
          note: `Handed to ${who}; ${identity.documentType.replace('_', ' ')} ending ${last4}${note ? `. ${note}` : ''}`,
          staff_id: input.staffId,
          occurred_at: at,
        },
      })

      await tx.found_bag.updateMany({
        where: { id: bagId, status: { in: ['matched', 'sent'] } },
        data: { status: 'delivered', updated_at: now },
      })

      await tx.lost_bag_report.updateMany({
        where: { id: reportId, status: { in: ACTIVE_CASE_STATUSES } },
        data: { status: 'closed', closed_at: at, updated_at: now },
      })

      return null
    })

    if (failure) {
      const what = failure.map((m) => MISMATCH_LABELS[m]).join(', ')
      throw new FoundBagError(FOUND_BAG_ERROR_CODES.OWNERSHIP_NOT_VERIFIED, `Ownership not verified: the ${what} does not match the case`)
    }

    return this.getById(input.deliveryId)
  }

  /**
   * Locks the case (see case-locks) and reads the delivery again under the lock. A closed or cancelled case takes no
   * more delivery steps.
   */
  private async lockCase(tx: Prisma.TransactionClient, reportId: string, deliveryId: string) {
    const locked = await lockLostReport(tx, reportId)

    if (!locked) {
      throw notFound()
    }

    if (!ACTIVE_CASE_STATUSES.includes(locked.status as ReportStatus)) {
      throw wrongStatus(`This case is ${locked.status}`)
    }

    const delivery = await this.findDelivery(deliveryId, tx)

    return { report: locked, delivery }
  }

  /** lockCase, then the case's confirmed bag: always in this order. */
  private async lockCaseAndBag(tx: Prisma.TransactionClient, reportId: string, deliveryId: string) {
    const { delivery } = await this.lockCase(tx, reportId, deliveryId)
    const bagId = await this.confirmedBagId(reportId, tx)

    if (!(await lockFoundBag(tx, bagId))) {
      throw wrongStatus('This case has no confirmed bag')
    }

    return { delivery, bagId }
  }

  private async listChecks(deliveryId: string): Promise<OwnershipCheck[]> {
    const rows = await this.db.audit_log.findMany({
      where: { source_feature: AUDIT_SOURCE_FEATURE, entity_type: OWNERSHIP_CHECK_ENTITY, entity_id: deliveryId },
      orderBy: { seq: 'desc' },
      take: MAX_CHECKS,
      select: { id: true, occurred_at: true, after: true },
    })

    const staffIds = [
      ...new Set(
        rows.flatMap((r) => {
          const staffId = (r.after as { staffId?: unknown } | null)?.staffId
          return typeof staffId === 'string' && UUID_PATTERN.test(staffId) ? [staffId] : []
        }),
      ),
    ]
    const staff = staffIds.length
      ? await this.db.staff.findMany({ where: { id: { in: staffIds } }, select: { id: true, first_name: true, last_name: true } })
      : []
    const names = new Map(staff.map((s) => [s.id, `${s.first_name} ${s.last_name}`]))

    return rows.flatMap((row) => toOwnershipCheck(row, names) ?? [])
  }

  private async findDelivery(id: string, db: Prisma.TransactionClient = this.db) {
    const delivery = UUID_PATTERN.test(id)
      ? await db.bag_delivery.findUnique({
          where: { id },
          select: { id: true, report_id: true, status: true, delivery_type: true, pickup_airport: true },
        })
      : null

    if (!delivery) {
      throw notFound()
    }

    return delivery
  }

  /** The found bag of the case's confirmed match. Every delivery has one: confirming a match is what creates it. */
  private async confirmedBagId(reportId: string, db: Prisma.TransactionClient): Promise<string> {
    const match = await db.bag_match.findFirst({ where: { report_id: reportId, status: 'confirmed' }, select: { found_bag_id: true } })

    if (!match) {
      throw wrongStatus('This case has no confirmed bag')
    }

    return match.found_bag_id
  }
}

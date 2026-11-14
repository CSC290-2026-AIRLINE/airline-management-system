import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { simNow } from '@backend/modules/pricing/fare-quote/sim-clock'

function generateClaimRef(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let code = ''
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return `CL-${code}`
}

export interface FileClaimInput {
  claim_type: string
  pieces_affected: number
  description: string
  claimed_amount: number
}

@Injectable()
export class CargoClaimsService {
  constructor(private readonly db: DbService) {}

  async fileClaim(bookingId: string, customerId: string, input: FileClaimInput) {
    const booking = await this.db.cargo_booking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        booking_ref: true,
        customer_id: true,
        pieces: true,
        quoted_charge: true,
        currency: true,
        cargo_shipment_event: { orderBy: { seq: 'desc' as const }, take: 1, select: { status_after: true } },
      },
    })
    if (!booking) {
      throw new NotFoundException({ error: { code: 'NOT_FOUND', message: 'Booking not found' } })
    }
    if (booking.customer_id !== customerId) {
      throw new NotFoundException({ error: { code: 'NOT_FOUND', message: 'Booking not found' } })
    }

    const currentStatus = booking.cargo_shipment_event[0]?.status_after ?? null
    if (currentStatus !== 'delivered') {
      throw new ConflictException({
        error: { code: 'CLAIM_NOT_ALLOWED', message: 'Claims can only be filed on delivered bookings' },
      })
    }

    const deliveredEvent = await this.db.cargo_shipment_event.findFirst({
      where: { cargo_booking_id: bookingId, event_type: 'delivered' },
      select: { occurred_at: true },
    })
    if (!deliveredEvent) {
      throw new ConflictException({
        error: { code: 'CLAIM_NOT_ALLOWED', message: 'No delivered event found' },
      })
    }

    const settings = await this.db.cargo_setting.findMany()
    const settingMap = new Map(settings.map((s) => [s.key, s.value]))
    const windowDays = Number(settingMap.get('claim_window_days') ?? 14)

    const now = simNow()
    const deadline = new Date(deliveredEvent.occurred_at.getTime() + windowDays * 24 * 3600_000)
    if (now > deadline) {
      throw new ConflictException({
        error: { code: 'CLAIM_NOT_ALLOWED', message: 'The claim window has expired' },
      })
    }

    if (input.claim_type !== 'damage' && input.claim_type !== 'loss') {
      throw new BadRequestException({
        error: { code: 'VALIDATION_ERROR', message: 'claim_type must be damage or loss' },
      })
    }
    if (!input.description || !input.description.trim()) {
      throw new BadRequestException({
        error: { code: 'VALIDATION_ERROR', message: 'description is required' },
      })
    }
    if (input.claimed_amount <= 0) {
      throw new BadRequestException({
        error: { code: 'VALIDATION_ERROR', message: 'claimed_amount must be greater than 0' },
      })
    }
    if (input.pieces_affected < 1 || input.pieces_affected > booking.pieces) {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_ERROR',
          message: `pieces_affected must be between 1 and ${booking.pieces}`,
        },
      })
    }

    let claimRef = generateClaimRef()
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const claim = await this.db.cargo_claim.create({
          data: {
            claim_ref: claimRef,
            cargo_booking_id: bookingId,
            claim_type: input.claim_type,
            pieces_affected: input.pieces_affected,
            description: input.description.trim(),
            claimed_amount: input.claimed_amount,
            currency: booking.currency,
            filed_at: now,
          },
        })
        return { id: claim.id, claimRef: claim.claim_ref }
      } catch (err: unknown) {
        if (typeof err === 'object' && err !== null && 'code' in err) {
          const code = (err as { code: string }).code
          if (code === 'P2002') {
            const meta = (err as { meta?: { target?: string[] } }).meta
            if (meta?.target?.includes('cargo_booking_id')) {
              throw new ConflictException({
                error: { code: 'CLAIM_NOT_ALLOWED', message: 'A claim already exists for this booking' },
              })
            }
            claimRef = generateClaimRef()
            continue
          }
        }
        throw err
      }
    }
    throw new ConflictException({
      error: { code: 'CLAIM_NOT_ALLOWED', message: 'Could not generate a unique claim reference' },
    })
  }

  async listClaims(opts: { status?: string; q?: string; page: number; pageSize: number }) {
    const { status, q, page, pageSize } = opts
    const offset = (page - 1) * pageSize
    const search = q ? `%${q}%` : null

    interface ClaimRow {
      id: string
      claim_ref: string
      booking_ref: string
      awb_number: string | null
      claim_type: string
      pieces_affected: number
      claimed_amount: string
      currency: string
      filed_at: Date
      decision: string | null
      approved_amount: string | null
      decided_at: Date | null
    }

    const rows = await this.db.$queryRaw<ClaimRow[]>`
      SELECT
        cc.id, cc.claim_ref,
        cb.booking_ref, cb.awb_number,
        cc.claim_type, cc.pieces_affected,
        cc.claimed_amount::text, cc.currency, cc.filed_at,
        ccd.decision, ccd.approved_amount::text, ccd.decided_at
      FROM cargo_claim cc
      JOIN cargo_booking cb ON cb.id = cc.cargo_booking_id
      LEFT JOIN cargo_claim_decision ccd ON ccd.cargo_claim_id = cc.id
      WHERE (${status ?? null}::text IS NULL
             OR (${status ?? null}::text = 'open' AND ccd.id IS NULL)
             OR (${status ?? null}::text = 'decided' AND ccd.id IS NOT NULL))
        AND (${search}::text IS NULL
             OR cc.claim_ref ILIKE ${search}::text
             OR cb.booking_ref ILIKE ${search}::text
             OR cb.awb_number ILIKE ${search}::text)
      ORDER BY cc.filed_at DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `

    const countRows = await this.db.$queryRaw<{ total: bigint }[]>`
      SELECT COUNT(*)::bigint AS total
      FROM cargo_claim cc
      JOIN cargo_booking cb ON cb.id = cc.cargo_booking_id
      LEFT JOIN cargo_claim_decision ccd ON ccd.cargo_claim_id = cc.id
      WHERE (${status ?? null}::text IS NULL
             OR (${status ?? null}::text = 'open' AND ccd.id IS NULL)
             OR (${status ?? null}::text = 'decided' AND ccd.id IS NOT NULL))
        AND (${search}::text IS NULL
             OR cc.claim_ref ILIKE ${search}::text
             OR cb.booking_ref ILIKE ${search}::text
             OR cb.awb_number ILIKE ${search}::text)
    `

    const total = Number(countRows[0]?.total ?? 0)

    const statusCounts = await this.db.$queryRaw<{ open: bigint; decided: bigint; all: bigint }[]>`
      SELECT
        COUNT(*) FILTER (WHERE ccd.id IS NULL)::bigint AS open,
        COUNT(*) FILTER (WHERE ccd.id IS NOT NULL)::bigint AS decided,
        COUNT(*)::bigint AS "all"
      FROM cargo_claim cc
      LEFT JOIN cargo_claim_decision ccd ON ccd.cargo_claim_id = cc.id
    `
    const counts = {
      open: Number(statusCounts[0]?.open ?? 0),
      decided: Number(statusCounts[0]?.decided ?? 0),
      all: Number(statusCounts[0]?.all ?? 0),
    }

    return {
      data: rows.map((r) => ({
        id: r.id,
        claimRef: r.claim_ref,
        bookingRef: r.booking_ref,
        awbNumber: r.awb_number,
        claimType: r.claim_type,
        piecesAffected: r.pieces_affected,
        claimedAmount: Number(r.claimed_amount),
        currency: r.currency,
        filedAt: r.filed_at,
        decision: r.decision
          ? { decision: r.decision, approvedAmount: r.approved_amount ? Number(r.approved_amount) : null, decidedAt: r.decided_at }
          : null,
      })),
      counts,
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    }
  }

  async getClaim(id: string) {
    const claim = await this.db.cargo_claim.findUnique({
      where: { id },
      include: {
        cargo_claim_decision: {
          include: { staff: { select: { id: true, first_name: true, last_name: true } } },
        },
        cargo_booking: {
          select: {
            id: true,
            booking_ref: true,
            awb_number: true,
            shipper_name: true,
            consignee_name: true,
            pieces: true,
            quoted_charge: true,
            currency: true,
            flight: { select: { flight_number: true, service_date: true } },
            cargo_commodity_type: { select: { name: true } },
            cargo_shipment_event: { orderBy: { seq: 'asc' as const } },
          },
        },
      },
    })
    if (!claim) {
      throw new NotFoundException({ error: { code: 'NOT_FOUND', message: 'Claim not found' } })
    }

    const b = claim.cargo_booking
    const decision = claim.cargo_claim_decision
    const events = b.cargo_shipment_event

    return {
      id: claim.id,
      claimRef: claim.claim_ref,
      claimType: claim.claim_type,
      piecesAffected: claim.pieces_affected,
      totalPieces: b.pieces,
      description: claim.description,
      claimedAmount: Number(claim.claimed_amount),
      currency: claim.currency,
      filedAt: claim.filed_at,
      status: decision ? decision.decision : 'open',
      decision: decision
        ? {
            decision: decision.decision,
            approvedAmount: decision.approved_amount ? Number(decision.approved_amount) : null,
            note: decision.note,
            decidedAt: decision.decided_at,
            decidedBy: `${decision.staff.first_name} ${decision.staff.last_name}`,
          }
        : null,
      booking: {
        id: b.id,
        bookingRef: b.booking_ref,
        awbNumber: b.awb_number,
        shipperName: b.shipper_name,
        consigneeName: b.consignee_name,
        flightNumber: b.flight.flight_number,
        flightServiceDate: b.flight.service_date,
        commodityTypeName: b.cargo_commodity_type.name,
        pieces: b.pieces,
        charge: Number(b.quoted_charge),
        currency: b.currency,
      },
      timeline: events.map((e) => ({
        id: e.id,
        occurredAt: e.occurred_at,
        eventType: e.event_type,
        statusBefore: e.status_before,
        statusAfter: e.status_after,
        actorType: e.actor_type,
        airportCode: e.airport_code,
        note: e.note,
      })),
    }
  }

  async decideClaim(claimId: string, staffId: string, input: { decision: string; approved_amount?: number; note: string }) {
    return this.db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ id: string; cargo_booking_id: string; claim_ref: string; claimed_amount: string }[]>`
        SELECT id, cargo_booking_id, claim_ref, claimed_amount::text
        FROM cargo_claim
        WHERE id = ${claimId}::uuid
        FOR UPDATE
      `
      if (rows.length === 0) {
        throw new NotFoundException({ error: { code: 'NOT_FOUND', message: 'Claim not found' } })
      }
      const claim = rows[0]

      const existing = await tx.cargo_claim_decision.findUnique({ where: { cargo_claim_id: claimId } })
      if (existing) {
        throw new ConflictException({
          error: { code: 'CLAIM_ALREADY_DECIDED', message: 'This claim has already been decided' },
        })
      }

      if (input.decision !== 'approved' && input.decision !== 'rejected') {
        throw new BadRequestException({
          error: { code: 'VALIDATION_ERROR', message: 'decision must be approved or rejected' },
        })
      }
      if (!input.note || !input.note.trim()) {
        throw new BadRequestException({
          error: { code: 'VALIDATION_ERROR', message: 'note is required' },
        })
      }

      const claimedAmount = Number(claim.claimed_amount)

      if (input.decision === 'approved') {
        if (input.approved_amount == null || input.approved_amount <= 0) {
          throw new BadRequestException({
            error: { code: 'VALIDATION_ERROR', message: 'approved_amount must be greater than 0 for approval' },
          })
        }
        if (input.approved_amount > claimedAmount) {
          throw new BadRequestException({
            error: { code: 'VALIDATION_ERROR', message: 'approved_amount cannot exceed the claimed amount' },
          })
        }
      }

      const now = simNow()

      await tx.cargo_claim_decision.create({
        data: {
          cargo_claim_id: claimId,
          decision: input.decision,
          approved_amount: input.decision === 'approved' ? input.approved_amount! : null,
          note: input.note.trim(),
          decided_by_staff_id: staffId,
          decided_at: now,
        },
      })

      const noticeTitle = input.decision === 'approved' ? 'Claim approved' : 'Claim rejected'
      const noticeMessage =
        input.decision === 'approved'
          ? `Your claim ${claim.claim_ref} has been approved. ${input.note.trim()}`
          : `Your claim ${claim.claim_ref} has been rejected. ${input.note.trim()}`

      await tx.cargo_notice.create({
        data: {
          cargo_booking_id: claim.cargo_booking_id,
          cargo_claim_id: claimId,
          title: noticeTitle,
          message: noticeMessage,
          notified_at: now,
        },
      })

      return { decision: input.decision }
    })
  }

  async resolveStaffId(userId: string): Promise<string> {
    const staff = await this.db.staff.findFirst({
      where: { user_id: userId, deleted_at: null },
      select: { id: true },
    })
    if (!staff) {
      throw new NotFoundException({ error: { code: 'NOT_FOUND', message: 'Staff account not found' } })
    }
    return staff.id
  }
}

import { Injectable, NotFoundException } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { type ApprovalPolicyInput, parsePolicyBody } from '../dto/approval.dto'

// Prisma maps a TIME column to a Date and keeps only its UTC time of day (same as the seed).
const toTime = (hhmm: string | null) => (hhmm === null ? null : new Date(`1970-01-01T${hhmm}:00Z`))
const fromTime = (d: Date | null) => (d === null ? null : d.toISOString().slice(11, 16))

/** The rules the simulated approver follows for departures from one airport. No row means no curfew and no cap. */
@Injectable()
export class ApprovalPolicyService {
  constructor(private readonly db: DbService) {}

  async get(iata: string) {
    const code = iata.trim().toUpperCase()
    const airport = await this.db.airport.findUnique({ where: { iata_code: code }, select: { iata_code: true } })
    if (!airport) throw new NotFoundException('Airport not found')
    const row = await this.db.airport_approval_policy.findUnique({ where: { airport: code } })
    return {
      airport: code,
      curfew_start_local: fromTime(row?.curfew_start_local ?? null),
      curfew_end_local: fromTime(row?.curfew_end_local ?? null),
      max_departure_per_hour: row?.max_departure_per_hour ?? null,
      offer_style: row?.offer_style ?? 'slots',
    }
  }

  async save(iata: string, body: unknown) {
    const input: ApprovalPolicyInput = parsePolicyBody(body)
    const code = iata.trim().toUpperCase()
    await this.get(code) // 404 for an unknown airport
    const data = {
      curfew_start_local: toTime(input.curfew_start_local),
      curfew_end_local: toTime(input.curfew_end_local),
      max_departure_per_hour: input.max_departure_per_hour,
      offer_style: input.offer_style,
    }
    await this.db.airport_approval_policy.upsert({
      where: { airport: code },
      create: { airport: code, ...data },
      update: { ...data, updated_at: new Date() },
    })
    return this.get(code)
  }
}

import { Injectable, Logger } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { FleetAuditService } from './fleet-audit.service'

export const RESERVE_RATIO_KEY = 'reserve_ratio'
export const DEFAULT_RESERVE_RATIO = 1.1

export type FleetReserveSummary = {
  date: string
  aircraft_needed: number
  reserve_ratio: number
  target: number
  ready: number
  shortfall: number
}

/** The fleet settings as one object, as the requirement document gives them. */
export type FleetSettingSummary = {
  reserve_ratio: number
  updated_at: string | null
  updated_by: string | null
}

function toIsoDate(value: Date | string): string {
  return typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10)
}

@Injectable()
export class FleetService {
  private readonly logger = new Logger(FleetService.name)

  constructor(
    private readonly db: DbService,
    private readonly audit: FleetAuditService,
  ) {}

  async getSettings(): Promise<FleetSettingSummary> {
    const setting = await this.db.fleet_setting.findUnique({ where: { key: RESERVE_RATIO_KEY } })
    return {
      reserve_ratio: await this.reserveRatio(),
      updated_at: setting ? setting.updated_at.toISOString() : null,
      updated_by: setting ? setting.updated_by : null,
    }
  }

  async updateReserveRatio(value: number, staffId: string): Promise<FleetSettingSummary> {
    const updated = await this.db.$transaction(async (tx) => {
      const previous = await tx.fleet_setting.findUnique({ where: { key: RESERVE_RATIO_KEY } })
      const saved = await tx.fleet_setting.upsert({
        where: { key: RESERVE_RATIO_KEY },
        update: { value: value.toFixed(2), updated_at: new Date(), updated_by: staffId },
        create: { key: RESERVE_RATIO_KEY, value: value.toFixed(2), updated_by: staffId },
      })
      await this.audit.record(tx, staffId, {
        action: 'update',
        entityType: 'fleet_setting',
        entityId: RESERVE_RATIO_KEY,
        summary: `Reserve ratio set to ${saved.value}`,
        before: { reserve_ratio: previous?.value ?? null },
        after: { reserve_ratio: saved.value },
      })
      return saved
    })
    return {
      reserve_ratio: Number.parseFloat(updated.value),
      updated_at: updated.updated_at.toISOString(),
      updated_by: updated.updated_by,
    }
  }

  /**
   * Ready aircraft are the ones that are in the fleet, not blocked by a status period and allowed to
   * fly on the weekday of the requested date.
   */
  async getReserve(date: string, aircraftNeeded: number): Promise<FleetReserveSummary> {
    const checkDate = toIsoDate(date)
    const ratio = await this.reserveRatio()
    const target = Math.ceil(aircraftNeeded * ratio)

    const weekday = new Date(checkDate).getUTCDay() || 7
    const aircraft = await this.db.aircraft.findMany({
      where: {
        deleted_at: null,
        entry_into_service_date: { lte: new Date(checkDate) },
        OR: [{ retired_on: null }, { retired_on: { gte: new Date(checkDate) } }],
      },
      include: {
        aircraft_status_period: { where: { deleted_at: null } },
        aircraft_operating_day: true,
      },
    })

    let ready = 0
    for (const item of aircraft) {
      const blocked = item.aircraft_status_period.some((period) => {
        if (period.status === 'in_service') return false
        const start = toIsoDate(period.start_date)
        const end = period.end_date ? toIsoDate(period.end_date) : '9999-12-31'
        return start <= checkDate && end >= checkDate
      })
      if (blocked) continue

      const operatingDays = item.aircraft_operating_day
      if (operatingDays.length > 0 && !operatingDays.some((day) => day.day_of_week === weekday)) continue

      ready += 1
    }

    return {
      date: checkDate,
      aircraft_needed: aircraftNeeded,
      reserve_ratio: ratio,
      target,
      ready,
      shortfall: Math.max(target - ready, 0),
    }
  }

  private async reserveRatio(): Promise<number> {
    const setting = await this.db.fleet_setting.findUnique({ where: { key: RESERVE_RATIO_KEY } })
    if (!setting) {
      this.logger.warn(`Fleet setting "${RESERVE_RATIO_KEY}" is missing, using the default ${DEFAULT_RESERVE_RATIO}`)
      return DEFAULT_RESERVE_RATIO
    }

    const ratio = Number.parseFloat(setting.value)
    if (Number.isNaN(ratio) || ratio <= 0) {
      this.logger.warn(`Fleet setting "${RESERVE_RATIO_KEY}" is not a number, using the default ${DEFAULT_RESERVE_RATIO}`)
      return DEFAULT_RESERVE_RATIO
    }
    return ratio
  }
}

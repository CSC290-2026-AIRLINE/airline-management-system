import { Injectable, Logger } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'

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

export type FleetSettingSummary = {
  key: string
  value: string
  updated_at: string
  updated_by: string | null
}

function toIsoDate(value: Date | string): string {
  return typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10)
}

@Injectable()
export class FleetService {
  private readonly logger = new Logger(FleetService.name)

  constructor(private readonly db: DbService) {}

  async getSettings(): Promise<FleetSettingSummary[]> {
    const settings = await this.db.fleet_setting.findMany({ orderBy: { key: 'asc' } })
    return settings.map((setting) => ({
      key: setting.key,
      value: setting.value,
      updated_at: setting.updated_at.toISOString(),
      updated_by: setting.updated_by,
    }))
  }

  async updateReserveRatio(value: number, staffId: string): Promise<FleetSettingSummary> {
    const updated = await this.db.fleet_setting.upsert({
      where: { key: RESERVE_RATIO_KEY },
      update: { value: String(value), updated_at: new Date(), updated_by: staffId },
      create: { key: RESERVE_RATIO_KEY, value: String(value), updated_by: staffId },
    })

    return {
      key: updated.key,
      value: updated.value,
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

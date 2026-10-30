import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import type { aircraft_maintenance, aircraft_status_period, Prisma } from '@backend/db/generated/prisma/client'
import {
  AvailabilityQueryDto,
  AircraftListQueryDto,
  CreateAircraftDto,
  CreateAircraftMaintenanceDto,
  CreateAircraftStatusDto,
  SetOperatingDaysDto,
  StatusChangesQueryDto,
  UpdateAircraftDto,
  UpdateAircraftMaintenanceDto,
} from './dto/aircraft.dto'
import type { SeatLayout } from './dto/layout.dto'
import { AuditService } from './audit.service'
import { SimulationClockService } from './simulation-clock.service'
import { computeCapacity, expandSeatMap, type SeatMap } from './seat-map'
import { hasPrismaErrorCode, PRISMA_FOREIGN_KEY_VIOLATION, PRISMA_UNIQUE_VIOLATION } from './prisma-error'

export type AircraftStatusSummary = {
  status: string
  origin: string | null
  reason: string | null
  start_date: string | null
  end_date: string | null
}

export type AircraftSummary = {
  id: string
  tail_number: string
  aircraft_type_id: string
  entry_into_service_date: string
  retired_on: string | null
  base_airport_code: string
  current_status: AircraftStatusSummary
}

/** The fleet list gives the status as one word; the detail of one aircraft gives the whole current period. */
export type AircraftListItem = Omit<AircraftSummary, 'current_status'> & {
  current_status: string
  aircraft_type: { id: string; code: string; model: string }
}

export type StatusPeriodSummary = {
  id: string
  aircraft_id: string
  status: string
  origin: string
  reason: string | null
  start_date: string
  end_date: string | null
  created_by: string
  created_at: string
}

export type MaintenanceSummary = {
  id: string
  aircraft_id: string
  maintenance_type: string
  planned_start_date: string
  planned_end_date: string
  actual_end_date: string | null
  status: string
  status_period_id: string
}

export type AvailabilityFailure = { check: string; reason: string }

export type AvailabilityResult = {
  aircraft_id: string
  available: boolean
  failing: AvailabilityFailure[]
}

/** `aircraft_status_period` holds calendar dates, so every comparison is done on the date part only. */
function toIsoDate(value: Date | string): string {
  return typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10)
}

function dayBefore(value: Date | string): Date {
  const day = new Date(toIsoDate(value))
  day.setUTCDate(day.getUTCDate() - 1)
  return day
}

function dayOfWeek(date: Date | string): number {
  const day = new Date(date).getUTCDay()
  return day === 0 ? 7 : day
}

function toPeriodSummary(period: aircraft_status_period): StatusPeriodSummary {
  return {
    id: period.id,
    aircraft_id: period.aircraft_id,
    status: period.status,
    origin: period.origin,
    reason: period.reason,
    start_date: toIsoDate(period.start_date),
    end_date: period.end_date ? toIsoDate(period.end_date) : null,
    created_by: period.created_by,
    created_at: period.created_at.toISOString(),
  }
}

/** A planned window is in progress from its planned start date on the simulation clock, with no staff action. */
function toMaintenanceSummary(window: aircraft_maintenance, today: string): MaintenanceSummary {
  const plannedStart = toIsoDate(window.planned_start_date)
  return {
    id: window.id,
    aircraft_id: window.aircraft_id,
    maintenance_type: window.maintenance_type,
    planned_start_date: plannedStart,
    planned_end_date: toIsoDate(window.planned_end_date),
    actual_end_date: window.actual_end_date ? toIsoDate(window.actual_end_date) : null,
    status: window.status === 'planned' && plannedStart <= today ? 'in_progress' : window.status,
    status_period_id: window.status_period_id,
  }
}

@Injectable()
export class AircraftService {
  /** The expanded grid of a type never changes, because its layout is write-once, so it is cached by type id. */
  private readonly seatMaps = new Map<string, SeatMap>()

  constructor(
    private readonly db: DbService,
    private readonly clock: SimulationClockService,
    private readonly audit: AuditService,
  ) {}

  async findAll(filters: AircraftListQueryDto): Promise<AircraftListItem[]> {
    const aircraft = await this.db.aircraft.findMany({
      where: {
        deleted_at: null,
        ...(filters.type ? { aircraft_type_id: filters.type } : {}),
        ...(filters.base ? { base_airport_code: filters.base.toUpperCase() } : {}),
      },
      include: {
        aircraft_type: { select: { id: true, code: true, model: true } },
        aircraft_status_period: {
          where: { deleted_at: null },
          orderBy: { start_date: 'desc' },
        },
      },
      orderBy: { created_at: 'desc' },
    })

    const items = aircraft.map((item) => ({
      id: item.id,
      tail_number: item.tail_number,
      aircraft_type_id: item.aircraft_type_id,
      entry_into_service_date: toIsoDate(item.entry_into_service_date),
      retired_on: item.retired_on ? toIsoDate(item.retired_on) : null,
      base_airport_code: item.base_airport_code,
      current_status: this.currentStatus(item.aircraft_status_period).status,
      aircraft_type: item.aircraft_type,
    }))

    return filters.status ? items.filter((item) => item.current_status === filters.status) : items
  }

  async findOne(id: string): Promise<AircraftSummary> {
    const aircraft = await this.db.aircraft.findFirst({
      where: { id, deleted_at: null },
      include: {
        aircraft_type: true,
        aircraft_status_period: { where: { deleted_at: null }, orderBy: { start_date: 'desc' } },
      },
    })
    if (!aircraft) {
      throw new NotFoundException(`Aircraft with ID ${id} not found`)
    }

    return {
      id: aircraft.id,
      tail_number: aircraft.tail_number,
      aircraft_type_id: aircraft.aircraft_type_id,
      entry_into_service_date: toIsoDate(aircraft.entry_into_service_date),
      retired_on: aircraft.retired_on ? toIsoDate(aircraft.retired_on) : null,
      base_airport_code: aircraft.base_airport_code,
      current_status: this.currentStatus(aircraft.aircraft_status_period),
    }
  }

  async create(dto: CreateAircraftDto, staffId: string): Promise<AircraftSummary> {
    const tailNumber = dto.tail_number.trim().toUpperCase()
    const baseAirportCode = dto.base_airport_code.trim().toUpperCase()
    const entryDate = toIsoDate(dto.entry_into_service_date)

    const [aircraftType, airport] = await Promise.all([
      this.db.aircraft_type.findFirst({ where: { id: dto.aircraft_type_id, deleted_at: null } }),
      this.db.airport.findUnique({ where: { iata_code: baseAirportCode } }),
    ])
    if (!aircraftType) {
      throw new NotFoundException(`Aircraft type with ID ${dto.aircraft_type_id} not found`)
    }
    if (!aircraftType.is_active) {
      throw new ConflictException(`Aircraft type ${aircraftType.code} is retired and cannot be used for a new aircraft`)
    }
    if (!airport) {
      throw new NotFoundException(`Airport with code "${baseAirportCode}" not found`)
    }

    try {
      const created = await this.db.$transaction(async (tx) => {
        const newAircraft = await tx.aircraft.create({
          data: {
            tail_number: tailNumber,
            aircraft_type_id: aircraftType.id,
            base_airport_code: baseAirportCode,
            entry_into_service_date: new Date(entryDate),
          },
        })

        await tx.aircraft_status_period.create({
          data: {
            aircraft_id: newAircraft.id,
            status: 'in_service',
            origin: 'manual',
            reason: 'Initial status on registration',
            start_date: new Date(entryDate),
            created_by: staffId,
          },
        })

        return newAircraft
      })

      return this.findOne(created.id)
    } catch (error) {
      if (hasPrismaErrorCode(error, PRISMA_UNIQUE_VIOLATION)) {
        throw new ConflictException(`Aircraft with tail number "${tailNumber}" already exists`)
      }
      if (hasPrismaErrorCode(error, PRISMA_FOREIGN_KEY_VIOLATION)) {
        throw new BadRequestException('The aircraft references a record that does not exist')
      }
      throw error
    }
  }

  async update(id: string, dto: UpdateAircraftDto): Promise<AircraftSummary> {
    const current = await this.findOne(id)

    const updateData: {
      tail_number?: string
      base_airport_code?: string
      aircraft_type_id?: string
      retired_on?: Date | null
      updated_at: Date
    } = {
      updated_at: new Date(),
    }

    if (dto.aircraft_type_id !== undefined && dto.aircraft_type_id !== current.aircraft_type_id) {
      const aircraftType = await this.db.aircraft_type.findFirst({ where: { id: dto.aircraft_type_id, deleted_at: null } })
      if (!aircraftType) {
        throw new NotFoundException(`Aircraft type with ID ${dto.aircraft_type_id} not found`)
      }
      if (!aircraftType.is_active) {
        throw new ConflictException(`Aircraft type ${aircraftType.code} is retired and cannot be used for an aircraft`)
      }
      if ((await this.db.flight.count({ where: { aircraft_id: id } })) > 0) {
        throw new ConflictException('The aircraft type cannot change once a flight uses the aircraft')
      }
      updateData.aircraft_type_id = aircraftType.id
    }

    if (dto.tail_number !== undefined) {
      updateData.tail_number = dto.tail_number.trim().toUpperCase()
    }

    if (dto.base_airport_code !== undefined) {
      const baseAirportCode = dto.base_airport_code.trim().toUpperCase()
      const airport = await this.db.airport.findUnique({ where: { iata_code: baseAirportCode } })
      if (!airport) {
        throw new NotFoundException(`Airport with code "${baseAirportCode}" not found`)
      }
      updateData.base_airport_code = baseAirportCode
    }

    if (dto.retired_on !== undefined) {
      updateData.retired_on = dto.retired_on === null ? null : new Date(toIsoDate(dto.retired_on))
    }

    try {
      await this.db.aircraft.update({ where: { id }, data: updateData })
    } catch (error) {
      if (hasPrismaErrorCode(error, PRISMA_UNIQUE_VIOLATION)) {
        throw new ConflictException(`Aircraft with tail number "${updateData.tail_number ?? ''}" already exists`)
      }
      throw error
    }

    return this.findOne(id)
  }

  async getStatus(aircraftId: string): Promise<AircraftStatusSummary> {
    const aircraft = await this.db.aircraft.findFirst({ where: { id: aircraftId, deleted_at: null }, select: { id: true } })
    if (!aircraft) {
      throw new NotFoundException(`Aircraft with ID ${aircraftId} not found`)
    }

    const periods = await this.db.aircraft_status_period.findMany({
      where: { aircraft_id: aircraftId, deleted_at: null },
      orderBy: { start_date: 'desc' },
    })
    return this.currentStatus(periods)
  }

  async getStatusHistory(aircraftId: string): Promise<StatusPeriodSummary[]> {
    const aircraft = await this.db.aircraft.findFirst({ where: { id: aircraftId, deleted_at: null }, select: { id: true } })
    if (!aircraft) {
      throw new NotFoundException(`Aircraft with ID ${aircraftId} not found`)
    }

    const periods = await this.db.aircraft_status_period.findMany({
      where: { aircraft_id: aircraftId, deleted_at: null },
      orderBy: { start_date: 'desc' },
    })
    return periods.map(toPeriodSummary)
  }

  async createStatus(aircraftId: string, dto: CreateAircraftStatusDto, staffId: string): Promise<StatusPeriodSummary> {
    const aircraft = await this.db.aircraft.findFirst({ where: { id: aircraftId, deleted_at: null }, select: { id: true } })
    if (!aircraft) {
      throw new NotFoundException(`Aircraft with ID ${aircraftId} not found`)
    }

    const startDate = toIsoDate(dto.start_date)
    const endDate = dto.end_date ? toIsoDate(dto.end_date) : null
    if (endDate && endDate < startDate) {
      throw new BadRequestException('end_date cannot be before start_date')
    }

    const created = await this.db.$transaction(async (tx) => {
      await this.resolveOverlaps(tx, aircraftId, startDate, endDate)

      return tx.aircraft_status_period.create({
        data: {
          aircraft_id: aircraftId,
          status: dto.status,
          origin: 'manual',
          reason: dto.reason ?? null,
          start_date: new Date(startDate),
          end_date: endDate ? new Date(endDate) : null,
          created_by: staffId,
        },
      })
    })

    this.audit.record({ action: 'status_period.created', entity: 'aircraft_status_period', entity_id: created.id, actor_staff_id: staffId })
    return toPeriodSummary(created)
  }

  async removeStatus(aircraftId: string, periodId: string): Promise<void> {
    const period = await this.db.aircraft_status_period.findFirst({
      where: { id: periodId, aircraft_id: aircraftId, deleted_at: null },
    })
    if (!period) {
      throw new NotFoundException('Status period not found for this aircraft')
    }
    if (period.origin === 'maintenance') {
      throw new ConflictException('Cannot manually delete a period created by maintenance')
    }

    await this.db.$transaction(async (tx) => {
      const now = new Date()
      await tx.aircraft_status_period.update({ where: { id: periodId }, data: { deleted_at: now, updated_at: now } })
      await this.restorePredecessor(tx, aircraftId, period)
    })

    this.audit.record({ action: 'status_period.cancelled', entity: 'aircraft_status_period', entity_id: periodId })
  }

  /**
   * Creating a period ends the open period before it the day before, so deleting it would leave a gap that reads as
   * `in_service`. A grounded or other non-default manual period that ends right before the deleted one is therefore
   * extended over the gap, up to the next period (or without an end). Staying grounded until someone sets the status
   * again is the safe side of that guess; an `in_service` predecessor needs nothing, because a gap already means that.
   */
  private async restorePredecessor(tx: Prisma.TransactionClient, aircraftId: string, deleted: aircraft_status_period): Promise<void> {
    const remaining = await tx.aircraft_status_period.findMany({ where: { aircraft_id: aircraftId, deleted_at: null } })
    const adjacentEnd = toIsoDate(dayBefore(deleted.start_date))

    const predecessor = remaining.find(
      (item) =>
        item.origin === 'manual' && item.status !== 'in_service' && item.end_date !== null && toIsoDate(item.end_date) === adjacentEnd,
    )
    if (!predecessor) {
      return
    }

    const next = remaining
      .filter((item) => toIsoDate(item.start_date) > toIsoDate(deleted.start_date))
      .sort((left, right) => toIsoDate(left.start_date).localeCompare(toIsoDate(right.start_date)))[0]

    await tx.aircraft_status_period.update({
      where: { id: predecessor.id },
      data: { end_date: next ? dayBefore(next.start_date) : null, updated_at: new Date() },
    })
  }

  async getSeatMap(aircraftId: string) {
    const aircraft = await this.db.aircraft.findFirst({
      where: { id: aircraftId, deleted_at: null },
      include: { aircraft_type: true },
    })
    if (!aircraft) {
      throw new NotFoundException(`Aircraft with ID ${aircraftId} not found`)
    }

    const seatMap = this.seatMapOf(aircraft.aircraft_type_id, aircraft.aircraft_type.layout as SeatLayout)
    return {
      aircraft_id: aircraft.id,
      aircraft_type_id: aircraft.aircraft_type_id,
      cabins: seatMap.cabins,
      seats: seatMap.seats,
    }
  }

  private seatMapOf(aircraftTypeId: string, layout: SeatLayout): SeatMap {
    const cached = this.seatMaps.get(aircraftTypeId)
    if (cached) {
      return cached
    }
    const seatMap = expandSeatMap(layout)
    this.seatMaps.set(aircraftTypeId, seatMap)
    return seatMap
  }

  async getCapacity(aircraftId: string) {
    const aircraft = await this.db.aircraft.findFirst({
      where: { id: aircraftId, deleted_at: null },
      include: { aircraft_type: true },
    })
    if (!aircraft) {
      throw new NotFoundException(`Aircraft with ID ${aircraftId} not found`)
    }

    return {
      aircraft_id: aircraft.id,
      aircraft_type_id: aircraft.aircraft_type_id,
      hold_weight_limit_kg: aircraft.aircraft_type.hold_weight_limit_kg,
      ...computeCapacity(aircraft.aircraft_type.layout as SeatLayout),
    }
  }

  async getAvailability(aircraftId: string, query: AvailabilityQueryDto): Promise<AvailabilityResult> {
    const aircraft = await this.db.aircraft.findFirst({
      where: { id: aircraftId, deleted_at: null },
      include: {
        aircraft_type: true,
        aircraft_status_period: { where: { deleted_at: null } },
        aircraft_operating_day: true,
      },
    })
    if (!aircraft) {
      throw new NotFoundException(`Aircraft with ID ${aircraftId} not found`)
    }

    return this.evaluateAvailability(aircraft, query)
  }

  /**
   * One query for the whole fleet: the availability rules are evaluated in memory so the endpoint
   * does not issue a query per aircraft.
   */
  async getAvailableAircraft(query: AvailabilityQueryDto): Promise<AircraftListItem[]> {
    const aircraft = await this.db.aircraft.findMany({
      where: {
        deleted_at: null,
        ...(query.type ? { aircraft_type_id: query.type } : {}),
      },
      include: {
        aircraft_type: { select: { id: true, code: true, model: true, max_range_km: true } },
        aircraft_status_period: { where: { deleted_at: null } },
        aircraft_operating_day: true,
      },
    })

    const available: AircraftListItem[] = []
    for (const item of aircraft) {
      const result = this.evaluateAvailability(item, query)
      if (!result.available) {
        continue
      }
      available.push({
        id: item.id,
        tail_number: item.tail_number,
        aircraft_type_id: item.aircraft_type_id,
        entry_into_service_date: toIsoDate(item.entry_into_service_date),
        retired_on: item.retired_on ? toIsoDate(item.retired_on) : null,
        base_airport_code: item.base_airport_code,
        current_status: this.currentStatus(item.aircraft_status_period).status,
        aircraft_type: {
          id: item.aircraft_type.id,
          code: item.aircraft_type.code,
          model: item.aircraft_type.model,
        },
      })
    }
    return available
  }

  async getStatusChanges(query: StatusChangesQueryDto): Promise<{ aircraft_id: string; changed_at: string }[]> {
    const since = query.since ? new Date(query.since) : new Date(0)
    const changed = await this.db.aircraft_status_period.findMany({
      // Deleted periods stay in the feed: deleting or cancelling one changes the status, and it bumps updated_at.
      where: { updated_at: { gt: since } },
      select: { aircraft_id: true, updated_at: true },
      distinct: ['aircraft_id'],
      orderBy: { updated_at: 'desc' },
    })
    return changed.map((item) => ({ aircraft_id: item.aircraft_id, changed_at: item.updated_at.toISOString() }))
  }

  async getMaintenanceList(aircraftId: string) {
    const aircraft = await this.db.aircraft.findFirst({ where: { id: aircraftId, deleted_at: null }, select: { id: true } })
    if (!aircraft) {
      throw new NotFoundException(`Aircraft with ID ${aircraftId} not found`)
    }

    const windows = await this.db.aircraft_maintenance.findMany({
      where: { aircraft_id: aircraftId, deleted_at: null },
      orderBy: { planned_start_date: 'desc' },
    })
    const today = this.clock.today()
    return windows.map((window) => toMaintenanceSummary(window, today))
  }

  async createMaintenance(aircraftId: string, dto: CreateAircraftMaintenanceDto, staffId: string): Promise<MaintenanceSummary> {
    const aircraft = await this.db.aircraft.findFirst({ where: { id: aircraftId, deleted_at: null }, select: { id: true } })
    if (!aircraft) {
      throw new NotFoundException(`Aircraft with ID ${aircraftId} not found`)
    }

    const plannedStart = toIsoDate(dto.planned_start_date)
    const plannedEnd = toIsoDate(dto.planned_end_date)
    if (plannedEnd < plannedStart) {
      throw new BadRequestException('planned_end_date cannot be before planned_start_date')
    }

    const created = await this.db.$transaction(async (tx) => {
      await this.resolveOverlaps(tx, aircraftId, plannedStart, plannedEnd)

      const statusPeriod = await tx.aircraft_status_period.create({
        data: {
          aircraft_id: aircraftId,
          status: 'in_maintenance',
          origin: 'maintenance',
          reason: `Scheduled ${dto.maintenance_type}`,
          start_date: new Date(plannedStart),
          end_date: new Date(plannedEnd),
          created_by: staffId,
        },
      })

      return tx.aircraft_maintenance.create({
        data: {
          aircraft_id: aircraftId,
          maintenance_type: dto.maintenance_type,
          planned_start_date: new Date(plannedStart),
          planned_end_date: new Date(plannedEnd),
          status: 'planned',
          status_period_id: statusPeriod.id,
          created_by: staffId,
        },
      })
    })

    this.audit.record({ action: 'maintenance.created', entity: 'aircraft_maintenance', entity_id: created.id, actor_staff_id: staffId })
    return toMaintenanceSummary(created, this.clock.today())
  }

  async updateMaintenance(aircraftId: string, maintenanceId: string, dto: UpdateAircraftMaintenanceDto): Promise<MaintenanceSummary> {
    const maintenance = await this.db.aircraft_maintenance.findFirst({
      where: { id: maintenanceId, aircraft_id: aircraftId, deleted_at: null },
    })
    if (!maintenance) {
      throw new NotFoundException('Maintenance window not found')
    }
    if (maintenance.status === 'cancelled') {
      throw new ConflictException('A cancelled maintenance window cannot be changed')
    }

    const actualEnd = dto.actual_end_date === undefined ? undefined : dto.actual_end_date === null ? null : toIsoDate(dto.actual_end_date)
    if (dto.status === 'completed' && !actualEnd) {
      throw new BadRequestException('actual_end_date is required when a maintenance window is completed')
    }

    // The dates are checked as they will be stored: a value that is not sent keeps the stored one.
    const datesChange = dto.planned_start_date !== undefined || dto.planned_end_date !== undefined || actualEnd !== undefined
    const plannedStart = toIsoDate(dto.planned_start_date ?? maintenance.planned_start_date)
    const plannedEnd = toIsoDate(dto.planned_end_date ?? maintenance.planned_end_date)
    const finalActualEnd =
      actualEnd === undefined ? (maintenance.actual_end_date ? toIsoDate(maintenance.actual_end_date) : null) : actualEnd
    if (datesChange) {
      if (plannedEnd < plannedStart) {
        throw new BadRequestException('planned_end_date cannot be before planned_start_date')
      }
      if (finalActualEnd && finalActualEnd < plannedStart) {
        throw new BadRequestException('actual_end_date cannot be before planned_start_date')
      }
    }

    const updated = await this.db.$transaction(async (tx) => {
      if (datesChange && dto.status !== 'cancelled') {
        await this.resolveOverlaps(tx, aircraftId, plannedStart, finalActualEnd ?? plannedEnd, maintenance.status_period_id)
      }

      const updateData: {
        status?: string
        planned_start_date?: Date
        planned_end_date?: Date
        actual_end_date?: Date | null
        updated_at: Date
      } = { updated_at: new Date() }

      if (dto.status !== undefined) updateData.status = dto.status
      if (dto.planned_start_date !== undefined) updateData.planned_start_date = new Date(toIsoDate(dto.planned_start_date))
      if (dto.planned_end_date !== undefined) updateData.planned_end_date = new Date(toIsoDate(dto.planned_end_date))
      if (actualEnd !== undefined) updateData.actual_end_date = actualEnd === null ? null : new Date(actualEnd)

      const updated = await tx.aircraft_maintenance.update({ where: { id: maintenanceId }, data: updateData })

      const periodUpdate: { start_date?: Date; end_date?: Date | null; deleted_at?: Date; updated_at: Date } = {
        updated_at: new Date(),
      }
      if (dto.planned_start_date !== undefined) periodUpdate.start_date = new Date(toIsoDate(dto.planned_start_date))
      if (dto.status === 'cancelled') {
        periodUpdate.deleted_at = new Date()
      } else if (actualEnd) {
        periodUpdate.end_date = new Date(actualEnd)
      } else if (dto.planned_end_date !== undefined) {
        periodUpdate.end_date = new Date(toIsoDate(dto.planned_end_date))
      }

      await tx.aircraft_status_period.update({ where: { id: maintenance.status_period_id }, data: periodUpdate })

      return updated
    })

    const action =
      dto.status === 'cancelled' ? 'maintenance.cancelled' : dto.status === 'completed' ? 'maintenance.completed' : 'maintenance.updated'
    this.audit.record({ action, entity: 'aircraft_maintenance', entity_id: updated.id })
    return toMaintenanceSummary(updated, this.clock.today())
  }

  async getOperatingDays(aircraftId: string): Promise<{ days: number[] }> {
    const aircraft = await this.db.aircraft.findFirst({ where: { id: aircraftId, deleted_at: null }, select: { id: true } })
    if (!aircraft) {
      throw new NotFoundException(`Aircraft with ID ${aircraftId} not found`)
    }

    const rows = await this.db.aircraft_operating_day.findMany({
      where: { aircraft_id: aircraftId },
      orderBy: { day_of_week: 'asc' },
    })
    return { days: rows.map((row) => row.day_of_week) }
  }

  async setOperatingDays(aircraftId: string, dto: SetOperatingDaysDto): Promise<{ days: number[] }> {
    const aircraft = await this.db.aircraft.findFirst({ where: { id: aircraftId, deleted_at: null }, select: { id: true } })
    if (!aircraft) {
      throw new NotFoundException(`Aircraft with ID ${aircraftId} not found`)
    }

    const days = [...new Set(dto.days)].sort((left, right) => left - right)

    return this.db.$transaction(async (tx) => {
      await tx.aircraft_operating_day.deleteMany({ where: { aircraft_id: aircraftId } })

      if (days.length > 0) {
        await tx.aircraft_operating_day.createMany({
          data: days.map((day) => ({ aircraft_id: aircraftId, day_of_week: day })),
        })
      }

      return { days }
    })
  }

  /**
   * Makes room for a new status period [startDate, endDate] (an open end when `endDate` is null). The live periods of one
   * aircraft may not overlap (the table has an exclusion constraint for exactly that), so every existing period is
   * checked first and an overlap is reported as a 409 instead of surfacing as a database error:
   * - an open-ended period that started before the new one is closed the day before it starts,
   * - an open-ended period that starts on the same day is replaced (it would have no days left),
   * - any other overlap, including with a bounded period such as a maintenance window, is a conflict.
   * `ignorePeriodId` leaves out the period that is being changed, so it does not conflict with itself.
   */
  private async resolveOverlaps(
    tx: Prisma.TransactionClient,
    aircraftId: string,
    startDate: string,
    endDate: string | null,
    ignorePeriodId?: string,
  ): Promise<void> {
    const periods = await tx.aircraft_status_period.findMany({ where: { aircraft_id: aircraftId, deleted_at: null } })

    for (const period of periods) {
      if (period.id === ignorePeriodId) {
        continue
      }
      const periodStart = toIsoDate(period.start_date)
      const periodEnd = period.end_date ? toIsoDate(period.end_date) : null

      if (periodEnd === null && periodStart < startDate) {
        const dayBefore = new Date(startDate)
        dayBefore.setUTCDate(dayBefore.getUTCDate() - 1)
        await tx.aircraft_status_period.update({ where: { id: period.id }, data: { end_date: dayBefore, updated_at: new Date() } })
        continue
      }
      if (periodEnd === null && periodStart === startDate) {
        await tx.aircraft_status_period.update({ where: { id: period.id }, data: { deleted_at: new Date(), updated_at: new Date() } })
        continue
      }

      const startsBeforeNewEnds = endDate === null || periodStart <= endDate
      const endsAfterNewStarts = periodEnd === null || periodEnd >= startDate
      if (startsBeforeNewEnds && endsAfterNewStarts) {
        throw new ConflictException({
          message: `The dates overlap an existing ${period.status} period (${periodStart} to ${periodEnd ?? 'onwards'}) of this aircraft`,
          details: { conflicting_period: toPeriodSummary(period) },
        })
      }
    }
  }

  private currentStatus(periods: aircraft_status_period[]): AircraftStatusSummary {
    const today = this.clock.today()
    const current = periods.find(
      (period) => toIsoDate(period.start_date) <= today && (period.end_date === null || toIsoDate(period.end_date) >= today),
    )

    if (!current) {
      return { status: 'in_service', origin: null, reason: null, start_date: null, end_date: null }
    }

    return {
      status: current.status,
      origin: current.origin,
      reason: current.reason,
      start_date: toIsoDate(current.start_date),
      end_date: current.end_date ? toIsoDate(current.end_date) : null,
    }
  }

  private evaluateAvailability(
    aircraft: {
      id: string
      entry_into_service_date: Date
      retired_on: Date | null
      aircraft_type: { max_range_km: number }
      aircraft_status_period: aircraft_status_period[]
      aircraft_operating_day: { day_of_week: number }[]
    },
    query: AvailabilityQueryDto,
  ): AvailabilityResult {
    const failing: AvailabilityFailure[] = []
    const from = query.from ? toIsoDate(query.from) : this.clock.today()
    const to = query.to ? toIsoDate(query.to) : from

    if (toIsoDate(aircraft.entry_into_service_date) > from || (aircraft.retired_on && toIsoDate(aircraft.retired_on) < to)) {
      failing.push({ check: 'not_in_fleet', reason: 'Aircraft is not in the fleet for the requested dates' })
    }

    for (const period of aircraft.aircraft_status_period) {
      if (period.status === 'in_service') continue
      const periodStart = toIsoDate(period.start_date)
      const periodEnd = period.end_date ? toIsoDate(period.end_date) : '9999-12-31'
      if (periodStart <= to && periodEnd >= from) {
        failing.push({
          check: 'status',
          reason: `${period.status} from ${periodStart}${period.reason ? ` (${period.reason})` : ''}`,
        })
      }
    }

    if (query.dep_date) {
      const weekday = dayOfWeek(query.dep_date)
      const operatingDays = aircraft.aircraft_operating_day
      if (operatingDays.length > 0 && !operatingDays.some((day) => day.day_of_week === weekday)) {
        failing.push({ check: 'operating_day', reason: `Does not fly on day ${weekday} of the week` })
      }
    }

    if (query.distance_km !== undefined && aircraft.aircraft_type.max_range_km < query.distance_km) {
      failing.push({
        check: 'range',
        reason: `Max range ${aircraft.aircraft_type.max_range_km} km is less than ${query.distance_km} km`,
      })
    }

    return { aircraft_id: aircraft.id, available: failing.length === 0, failing }
  }
}

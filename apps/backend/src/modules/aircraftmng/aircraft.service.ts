import { Injectable, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { DbService } from '../../db/db.service';
import { CreateAircraftDto } from '../dto/create-aircraft.dto';
import { CreateAircraftStatusDto } from '../dto/create-aircraft-status.dto';
import { CreateAircraftMaintenanceDto } from '../dto/create-aircraft-maintenance.dto';
import { UpdateAircraftMaintenanceDto } from '../dto/update-aircraft-maintenance.dto';
import { CreateTurnaroundDto, UpdateTaskStatusDto } from '../dto/turnaround.dto';
import { CreateRouteDto } from '../dto/create-route.dto';

@Injectable()
export class AircraftService {
  constructor(private readonly db: DbService) {}

  private getCurrentStatus(periods: any[]) {
    const now = new Date()
    const current = periods.find(
      (p: any) => !p.deleted_at && new Date(p.start_date) <= now && (p.end_date === null || new Date(p.end_date) >= now),
    )
    if (!current) return { status: 'in_service', reason: null, start_date: null, end_date: null }
    return {
      status: current.status,
      origin: current.origin,
      reason: current.reason,
      start_date: current.start_date,
      end_date: current.end_date,
    }
  }

  private expandSeatMap(layout: any) {
    if (!layout || !layout.cabins) return { cabins: [], seats: [] }
    const cabins: any[] = []
    const seats: any[] = []
    for (const cabin of layout.cabins) {
      cabins.push({
        cabin_class: cabin.cabin_class,
        columns: cabin.columns,
        aisle_after: cabin.aisle_after || [],
      })
      const skipRows = new Set(cabin.skip_rows || [])
      const rowTypes: Record<string, string> = {}
      if (cabin.row_types) {
        for (const [type, rows] of Object.entries(cabin.row_types)) {
          for (const r of rows as number[]) {
            rowTypes[r] = type
          }
        }
      }
      const blockedSeats = new Set(cabin.blocked_seats || [])
      for (let row = cabin.first_row; row <= cabin.last_row; row++) {
        if (skipRows.has(row)) continue
        for (const col of cabin.columns) {
          const seatLabel = `${row}${col}`
          let seatType = rowTypes[row] || 'normal'
          if (blockedSeats.has(seatLabel)) seatType = 'blocked'
          seats.push({
            seat: seatLabel,
            row,
            column: col,
            cabin_class: cabin.cabin_class,
            seat_type: seatType,
          })
        }
      }
    }
    return { cabins, seats }
  }

  private computeCapacity(layout: any) {
    const { seats } = this.expandSeatMap(layout)
    const cabinMap: Record<string, { seats: number; blocked: number; sellable: number }> = {}
    for (const s of seats) {
      if (!cabinMap[s.cabin_class]) cabinMap[s.cabin_class] = { seats: 0, blocked: 0, sellable: 0 }
      cabinMap[s.cabin_class].seats++
      if (s.seat_type === 'blocked') {
        cabinMap[s.cabin_class].blocked++
      } else {
        cabinMap[s.cabin_class].sellable++
      }
    }
    const cabins = Object.entries(cabinMap).map(([cabin_class, counts]) => ({
      cabin_class,
      ...counts,
    }))
    return {
      cabins,
      total_seats: seats.length,
      total_sellable: seats.filter((s: any) => s.seat_type !== 'blocked').length,
    }
  }

  // ดึง Staff ID จากฐานข้อมูลจริงโดยอัตโนมัติ
  private async resolveStaffId(tx: any): Promise<string> {
    const firstStaff = await tx.staff.findFirst()
    if (!firstStaff) {
      throw new NotFoundException('No staff found in database. Please seed or create a staff record first.')
    }
    return firstStaff.id
  }

  async findAll(filters?: { type?: string; base?: string; status?: string }) {
    const aircraft = await this.db.aircraft.findMany({
      where: { deleted_at: null },
      include: {
        aircraft_type: true,
        aircraft_status_period: {
          where: { deleted_at: null },
          orderBy: { start_date: 'desc' as const },
        },
      },
      orderBy: { created_at: 'desc' as const },
    })

    let result = aircraft.map((a: any) => {
      const cs = this.getCurrentStatus(a.aircraft_status_period)
      return {
        id: a.id,
        tail_number: a.tail_number,
        aircraft_type_id: a.aircraft_type_id,
        entry_into_service_date: a.entry_into_service_date,
        retired_on: a.retired_on,
        base_airport_code: a.base_airport_code,
        current_status: cs.status,
        aircraft_type: a.aircraft_type,
      }
    })

    if (filters?.type) {
      result = result.filter((a: any) => a.aircraft_type_id === filters.type || a.aircraft_type?.code === filters.type)
    }
    if (filters?.base) {
      const baseUpper = filters.base.toUpperCase()
      result = result.filter((a: any) => a.base_airport_code === baseUpper)
    }
    if (filters?.status) {
      result = result.filter((a: any) => a.current_status === filters.status)
    }
    return result
  }

  async findOne(id: string) {
    const aircraft = await this.db.aircraft.findFirst({
      where: { id, deleted_at: null },
      include: {
        aircraft_type: true,
        aircraft_status_period: {
          where: { deleted_at: null },
          orderBy: { start_date: 'desc' as const },
        },
      },
    })
    if (!aircraft) throw new NotFoundException(`Aircraft with ID ${id} not found`)

    const cs = this.getCurrentStatus(aircraft.aircraft_status_period)
    return {
      id: aircraft.id,
      tail_number: aircraft.tail_number,
      aircraft_type_id: aircraft.aircraft_type_id,
      entry_into_service_date: aircraft.entry_into_service_date,
      retired_on: aircraft.retired_on,
      base_airport_code: aircraft.base_airport_code,
      current_status: cs,
    }
  }

  async create(createAircraftDto: CreateAircraftDto) {
    const tailNumber = (createAircraftDto.tailNumber || createAircraftDto.tail_number)?.trim()?.toUpperCase()
    if (!tailNumber) {
      throw new BadRequestException('tailNumber is required')
    }

    const typeQuery = (createAircraftDto.type || createAircraftDto.aircraft_type_id || createAircraftDto.model)?.trim()
    if (!typeQuery) {
      throw new BadRequestException('aircraft type or model is required')
    }

    const baseAirport = (createAircraftDto.base || createAircraftDto.base_airport_code)?.trim()?.toUpperCase()
    if (!baseAirport) {
      throw new BadRequestException('base airport code is required')
    }

    const existingAircraft = await this.db.aircraft.findFirst({
      where: { tail_number: tailNumber, deleted_at: null },
    })
    if (existingAircraft) {
      throw new ConflictException(`Aircraft with tail number "${tailNumber}" already exists`)
    }

    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(typeQuery)
    let aircraftType = isUuid ? await this.db.aircraft_type.findFirst({ where: { id: typeQuery, deleted_at: null } }) : null

    if (!aircraftType) {
      aircraftType = await this.db.aircraft_type.findFirst({
        where: {
          OR: [{ code: { equals: typeQuery, mode: 'insensitive' as const } }, { model: { equals: typeQuery, mode: 'insensitive' as const } }],
          deleted_at: null,
        },
      })
    }

    if (!aircraftType) {
      throw new NotFoundException(`Aircraft type "${typeQuery}" not found`)
    }

    const airport = await this.db.airport.findUnique({ where: { iata_code: baseAirport } })
    if (!airport) {
      throw new NotFoundException(`Airport with code "${baseAirport}" not found`)
    }

    const entryDate =
      createAircraftDto.entryIntoServiceDate || createAircraftDto.entry_into_service_date
        ? new Date((createAircraftDto.entryIntoServiceDate || createAircraftDto.entry_into_service_date)!)
        : new Date()

    return this.db.$transaction(async (tx) => {
      const newAircraft = await tx.aircraft.create({
        data: {
          tail_number: tailNumber,
          aircraft_type_id: aircraftType.id,
          base_airport_code: baseAirport,
          entry_into_service_date: entryDate,
        },
      })

      const staffId = await this.resolveStaffId(tx)

      await tx.aircraft_status_period.create({
        data: {
          aircraft_id: newAircraft.id,
          status: 'in_service',
          origin: 'manual',
          reason: 'Initial status on registration',
          start_date: entryDate,
          created_by: staffId,
        },
      })

     const createdAircraft = await tx.aircraft.findFirst({
        where: { id: newAircraft.id, deleted_at: null },
        include: {
          aircraft_type: true,
          aircraft_status_period: {
            where: { deleted_at: null },
            orderBy: { start_date: 'desc' as const },
          },
        },
      })

      if (!createdAircraft) {
        throw new NotFoundException('Aircraft not found after creation')
      }

      const cs = this.getCurrentStatus(createdAircraft.aircraft_status_period)
      return {
        id: createdAircraft.id,
        tail_number: createdAircraft.tail_number,
        aircraft_type_id: createdAircraft.aircraft_type_id,
        entry_into_service_date: createdAircraft.entry_into_service_date,
        retired_on: createdAircraft.retired_on,
        base_airport_code: createdAircraft.base_airport_code,
        current_status: cs,
      }
    })
  }

 async update(id: string, data: { tail_number?: string; base_airport_code?: string; retired_on?: string | null }) {
    await this.findOne(id)

    const updateData: any = { updated_at: new Date() }
    
    if (data.tail_number) {
      updateData.tail_number = data.tail_number.trim().toUpperCase()
    }

    if (data.base_airport_code) {
      const baseAirport = data.base_airport_code.trim().toUpperCase()
      const airport = await this.db.airport.findUnique({ where: { iata_code: baseAirport } })
      if (!airport) {
        throw new NotFoundException(`Airport with code "${baseAirport}" not found`)
      }
      updateData.base_airport_code = baseAirport
    }

    if (data.retired_on !== undefined) {
      updateData.retired_on = data.retired_on ? new Date(data.retired_on) : null
    }
    await this.db.aircraft.update({ where: { id }, data: updateData })
    return this.findOne(id)
  }
  async getStatus(aircraftId: string) {
    const periods = await this.db.aircraft_status_period.findMany({
      where: { aircraft_id: aircraftId, deleted_at: null },
      orderBy: { start_date: 'desc' as const },
    })
    return this.getCurrentStatus(periods)
  }

  async getStatusHistory(aircraftId: string) {
    return this.db.aircraft_status_period.findMany({
      where: { aircraft_id: aircraftId, deleted_at: null },
      orderBy: { start_date: 'desc' as const },
    })
  }

  async createStatus(aircraftId: string, dto: CreateAircraftStatusDto) {
    if (dto.status === 'in_maintenance') {
      throw new BadRequestException('in_maintenance can only be created via maintenance window')
    }

    const startDate = new Date(dto.start_date)
    const endDate = dto.end_date ? new Date(dto.end_date) : null

    return this.db.$transaction(async (tx) => {
      const openPeriods = await tx.aircraft_status_period.findMany({
        where: { aircraft_id: aircraftId, deleted_at: null, end_date: null },
      })
      for (const op of openPeriods) {
        if (new Date(op.start_date) <= startDate) {
          const dayBefore = new Date(startDate)
          dayBefore.setDate(dayBefore.getDate() - 1)
          await tx.aircraft_status_period.update({
            where: { id: op.id },
            data: { end_date: dayBefore, updated_at: new Date() },
          })
        }
      }

      const staffId = await this.resolveStaffId(tx)

      return tx.aircraft_status_period.create({
        data: {
          aircraft_id: aircraftId,
          status: dto.status,
          origin: 'manual',
          reason: dto.reason,
          start_date: startDate,
          end_date: endDate,
          created_by: staffId,
        },
      })
    })
  }

  async removeStatus(aircraftId: string, periodId: string) {
    const period = await this.db.aircraft_status_period.findUnique({ where: { id: periodId } })
    if (!period) throw new NotFoundException('Status period not found')

    if (period.origin === 'maintenance') {
      throw new ConflictException('Cannot manually delete a period created by maintenance')
    }

    return this.db.aircraft_status_period.update({
      where: { id: periodId },
      data: { deleted_at: new Date() },
    })
  }

  async getSeatMap(aircraftId: string) {
    const aircraft = await this.db.aircraft.findFirst({
      where: { id: aircraftId, deleted_at: null },
      include: { aircraft_type: true },
    })
    if (!aircraft) throw new NotFoundException(`Aircraft with ID ${aircraftId} not found`)

    const layout = aircraft.aircraft_type.layout as any
    const { cabins, seats } = this.expandSeatMap(layout)

    return {
      aircraft_id: aircraft.id,
      aircraft_type_id: aircraft.aircraft_type_id,
      cabins,
      seats,
    }
  }

  async getCapacity(aircraftId: string) {
    const aircraft = await this.db.aircraft.findFirst({
      where: { id: aircraftId, deleted_at: null },
      include: { aircraft_type: true },
    })
    if (!aircraft) throw new NotFoundException(`Aircraft with ID ${aircraftId} not found`)

    const layout = aircraft.aircraft_type.layout as any
    const capacity = this.computeCapacity(layout)

    return {
      aircraft_id: aircraft.id,
      aircraft_type_id: aircraft.aircraft_type_id,
      hold_weight_limit_kg: aircraft.aircraft_type.hold_weight_limit_kg,
      ...capacity,
    }
  }

  async getAvailability(aircraftId: string, query: { from?: string; to?: string; dep_date?: string; distance_km?: string }) {
    const aircraft = await this.db.aircraft.findFirst({
      where: { id: aircraftId, deleted_at: null },
      include: { aircraft_type: true, aircraft_status_period: { where: { deleted_at: null } } },
    })
    if (!aircraft) throw new NotFoundException(`Aircraft with ID ${aircraftId} not found`)

    const failing: { check: string; reason: string }[] = []
    const from = query.from ? new Date(query.from) : new Date()
    const to = query.to ? new Date(query.to) : from

    if (new Date(aircraft.entry_into_service_date) > from || (aircraft.retired_on && new Date(aircraft.retired_on) < to)) {
      failing.push({ check: 'not_in_fleet', reason: 'Aircraft is not in the fleet for the requested dates' })
    }

    const conflicting = aircraft.aircraft_status_period.filter((p: any) => {
      if (p.status === 'in_service') return false
      const pStart = new Date(p.start_date)
      const pEnd = p.end_date ? new Date(p.end_date) : new Date('9999-12-31')
      return pStart <= to && pEnd >= from
    })
    for (const c of conflicting) {
      failing.push({
        check: 'status',
        reason: `${c.status} from ${c.start_date}${c.reason ? ` (${c.reason})` : ''}`,
      })
    }

    if (query.dep_date) {
      const depDate = new Date(query.dep_date)
      let dow = depDate.getDay()
      dow = dow === 0 ? 7 : dow
      const opDays = await this.db.aircraft_operating_day.findMany({ where: { aircraft_id: aircraftId } })
      if (opDays.length > 0 && !opDays.some((d: any) => d.day_of_week === dow)) {
        const dayNames = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
        failing.push({ check: 'operating_day', reason: `Does not fly on ${dayNames[dow]} (${dow})` })
      }
    }

    if (query.distance_km) {
      const dist = Number(query.distance_km)
      if (aircraft.aircraft_type.max_range_km < dist) {
        failing.push({ check: 'range', reason: `Max range ${aircraft.aircraft_type.max_range_km} km is less than ${dist} km` })
      }
    }

    return {
      aircraft_id: aircraftId,
      available: failing.length === 0,
      failing,
    }
  }

  async getAvailableAircraft(query: { type?: string; from?: string; to?: string; dep_date?: string; distance_km?: string }) {
    const allAircraft = await this.db.aircraft.findMany({
      where: {
        deleted_at: null,
        ...(query.type ? { aircraft_type_id: query.type } : {}),
      },
    })

    const available: any[] = []
    for (const a of allAircraft) {
      const result = await this.getAvailability(a.id, query)
      if (result.available) {
        available.push({
          id: a.id,
          tail_number: a.tail_number,
          aircraft_type_id: a.aircraft_type_id,
          base_airport_code: a.base_airport_code,
        })
      }
    }
    return available
  }

  async getStatusChanges(since: string) {
    const sinceDate = new Date(since)
    const changed = await this.db.aircraft_status_period.findMany({
      where: { updated_at: { gt: sinceDate } },
      select: { aircraft_id: true, updated_at: true },
      distinct: ['aircraft_id'],
      orderBy: { updated_at: 'desc' as const },
    })
    return changed.map((c: any) => ({ aircraft_id: c.aircraft_id, changed_at: c.updated_at }))
  }

  async getMaintenanceList(aircraftId: string) {
    return this.db.aircraft_maintenance.findMany({
      where: { aircraft_id: aircraftId, deleted_at: null },
      orderBy: { planned_start_date: 'desc' as const },
    })
  }

  async createMaintenance(aircraftId: string, dto: CreateAircraftMaintenanceDto) {
    const startDate = new Date(dto.planned_start_date)
    const endDate = new Date(dto.planned_end_date)

    return this.db.$transaction(async (tx) => {
      const openPeriods = await tx.aircraft_status_period.findMany({
        where: { aircraft_id: aircraftId, deleted_at: null, end_date: null },
      })
      for (const op of openPeriods) {
        if (new Date(op.start_date) <= startDate) {
          const dayBefore = new Date(startDate)
          dayBefore.setDate(dayBefore.getDate() - 1)
          await tx.aircraft_status_period.update({
            where: { id: op.id },
            data: { end_date: dayBefore, updated_at: new Date() },
          })
        }
      }

      const staffId = await this.resolveStaffId(tx)

      const statusPeriod = await tx.aircraft_status_period.create({
        data: {
          aircraft_id: aircraftId,
          status: 'in_maintenance',
          origin: 'maintenance',
          reason: `Scheduled ${dto.maintenance_type}`,
          start_date: startDate,
          end_date: endDate,
          created_by: staffId,
        },
      })

      return tx.aircraft_maintenance.create({
        data: {
          aircraft_id: aircraftId,
          maintenance_type: dto.maintenance_type,
          planned_start_date: startDate,
          planned_end_date: endDate,
          status: 'planned',
          status_period_id: statusPeriod.id,
          created_by: staffId,
        },
      })
    })
  }

  async updateMaintenance(aircraftId: string, maintenanceId: string, dto: UpdateAircraftMaintenanceDto) {
    const maintenance = await this.db.aircraft_maintenance.findFirst({
      where: { id: maintenanceId, aircraft_id: aircraftId, deleted_at: null },
    })
    if (!maintenance) throw new NotFoundException('Maintenance window not found')

    return this.db.$transaction(async (tx) => {
      const updateData: any = { updated_at: new Date() }

      if (dto.status) updateData.status = dto.status
      if (dto.planned_start_date) updateData.planned_start_date = new Date(dto.planned_start_date)
      if (dto.planned_end_date) updateData.planned_end_date = new Date(dto.planned_end_date)
      if (dto.actual_end_date) updateData.actual_end_date = new Date(dto.actual_end_date)

      const updated = await tx.aircraft_maintenance.update({
        where: { id: maintenanceId },
        data: updateData,
      })

      const statusUpdate: any = { updated_at: new Date() }
      if (dto.planned_start_date) statusUpdate.start_date = new Date(dto.planned_start_date)
      if (dto.actual_end_date) {
        statusUpdate.end_date = new Date(dto.actual_end_date)
      } else if (dto.planned_end_date) {
        statusUpdate.end_date = new Date(dto.planned_end_date)
      }
      if (dto.status === 'cancelled') {
        statusUpdate.deleted_at = new Date()
      }

      await tx.aircraft_status_period.update({
        where: { id: maintenance.status_period_id },
        data: statusUpdate,
      })

      return updated
    })
  }

  async getOperatingDays(aircraftId: string) {
    const rows = await this.db.aircraft_operating_day.findMany({
      where: { aircraft_id: aircraftId },
      orderBy: { day_of_week: 'asc' as const },
    })
    return { days: rows.map((r: any) => r.day_of_week) }
  }

  async setOperatingDays(aircraftId: string, days: number[]) {
    const aircraft = await this.db.aircraft.findFirst({ where: { id: aircraftId, deleted_at: null } })
    if (!aircraft) throw new NotFoundException(`Aircraft with ID ${aircraftId} not found`)

    return this.db.$transaction(async (tx) => {
      await tx.aircraft_operating_day.deleteMany({ where: { aircraft_id: aircraftId } })

      if (days && days.length > 0) {
        await tx.aircraft_operating_day.createMany({
          data: days.map((day) => ({ aircraft_id: aircraftId, day_of_week: day })),
        })
      }

      const rows = await tx.aircraft_operating_day.findMany({
        where: { aircraft_id: aircraftId },
        orderBy: { day_of_week: 'asc' as const },
      })
      return { days: rows.map((r: any) => r.day_of_week) }
    })
  }

  async createTurnaround(aircraftId: string, dto: CreateTurnaroundDto) {
    const existing = await this.db.aircraft_turnaround.findFirst({
      where: { flight_id: dto.flight_id, deleted_at: null },
      include: { aircraft_turnaround_task: true },
    })
    if (existing) {
      return this.formatTurnaround(existing)
    }

    const turnaround = await this.db.aircraft_turnaround.create({
      data: {
        aircraft_id: aircraftId,
        flight_id: dto.flight_id,
        airport_code: dto.airport_code,
        arrived_at: new Date(dto.arrived_at),
        aircraft_turnaround_task: {
          create: ['refuel', 'cleaning', 'catering', 'inspection'].map((taskType) => ({
            task_type: taskType,
            status: 'pending',
          })),
        },
      },
      include: { aircraft_turnaround_task: true },
    })
    return this.formatTurnaround(turnaround)
  }

  async getLatestTurnaround(aircraftId: string) {
    const turnaround = await this.db.aircraft_turnaround.findFirst({
      where: { aircraft_id: aircraftId, deleted_at: null },
      orderBy: { arrived_at: 'desc' as const },
      include: { aircraft_turnaround_task: true },
    })
    if (!turnaround) return null
    return this.formatTurnaround(turnaround)
  }

  private formatTurnaround(turnaround: any) {
    const tasks = turnaround.aircraft_turnaround_task || []
    const allDone = tasks.length > 0 && tasks.every((t: any) => t.status === 'completed' || t.status === 'skipped')
    const completionTimes = tasks
      .filter((t: any) => t.completed_at)
      .map((t: any) => new Date(t.completed_at).getTime())
    const readyAt = allDone && completionTimes.length > 0 ? new Date(Math.max(...completionTimes)) : null

    return {
      id: turnaround.id,
      flight_id: turnaround.flight_id,
      airport_code: turnaround.airport_code,
      arrived_at: turnaround.arrived_at,
      is_ready: allDone,
      ready_at: readyAt,
      tasks: tasks.map((t: any) => ({
        id: t.id,
        task_type: t.task_type,
        status: t.status,
        started_at: t.started_at,
        completed_at: t.completed_at,
      })),
    }
  }

  async updateTurnaroundTask(turnaroundId: string, taskId: string, dto: UpdateTaskStatusDto) {
    const task = await this.db.aircraft_turnaround_task.findUnique({ where: { id: taskId } })
    if (!task || task.turnaround_id !== turnaroundId) {
      throw new NotFoundException('Task not found')
    }

    const updateData: any = { status: dto.status }
    if (dto.started_at) updateData.started_at = new Date(dto.started_at)
    if (dto.completed_at) updateData.completed_at = new Date(dto.completed_at)

    if (dto.status === 'in_progress' && !dto.started_at) updateData.started_at = new Date()
    if ((dto.status === 'completed' || dto.status === 'skipped') && !dto.completed_at) updateData.completed_at = new Date()

    return this.db.aircraft_turnaround_task.update({
      where: { id: taskId },
      data: updateData,
    })
  }

  async createRoute(dto: CreateRouteDto) {
    return this.db.route.create({
      data: {
        origin: dto.origin,
        destination: dto.destination,
        distance_km: Number(dto.distance_km),
        block_time_min: Number(dto.block_time_min),
        is_active: true,
      },
    })
  }

  async createFlight(dto: {
    flight_number: string
    service_date: string
    scheduled_dep_at: string
    scheduled_arr_at: string
    dep_at?: string
    arr_at?: string
    route_id: string
    aircraft_id: string
  }) {
    return this.db.flight.create({
      data: {
        flight_number: dto.flight_number,
        service_date: new Date(dto.service_date),
        scheduled_dep_at: new Date(dto.scheduled_dep_at),
        scheduled_arr_at: new Date(dto.scheduled_arr_at),
        dep_at: dto.dep_at ? new Date(dto.dep_at) : new Date(dto.scheduled_dep_at),
        arr_at: dto.arr_at ? new Date(dto.arr_at) : new Date(dto.scheduled_dep_at),
        route_id: dto.route_id,
        aircraft_id: dto.aircraft_id,
      },
    })
  }

  async getFleetSettings() {
    return this.db.fleet_setting.findMany()
  }

  async updateFleetSetting(key: string, value: string) {
    return this.db.fleet_setting.upsert({
      where: { key },
      update: { value, updated_at: new Date() },
      create: { key, value },
    })
  }

  async getFleetReserve(date: string, aircraftNeeded: number) {
    const settings = await this.db.fleet_setting.findUnique({ where: { key: 'reserve_ratio' } })
    const ratio = settings ? parseFloat(settings.value) : 1.1
    const target = Math.ceil(aircraftNeeded * ratio)

    const checkDate = new Date(date)
    let dow = checkDate.getDay()
    dow = dow === 0 ? 7 : dow

    const allAircraft = await this.db.aircraft.findMany({
      where: {
        deleted_at: null,
        entry_into_service_date: { lte: checkDate },
        OR: [{ retired_on: null }, { retired_on: { gte: checkDate } }],
      },
      include: {
        aircraft_status_period: { where: { deleted_at: null } },
        aircraft_operating_day: true,
      },
    })

    let ready = 0
    for (const a of allAircraft) {
      const hasBlockingStatus = a.aircraft_status_period.some((p: any) => {
        if (p.status === 'in_service') return false
        const pStart = new Date(p.start_date)
        const pEnd = p.end_date ? new Date(p.end_date) : new Date('9999-12-31')
        return pStart <= checkDate && pEnd >= checkDate
      })
      if (hasBlockingStatus) continue

      const opDays = a.aircraft_operating_day
      if (opDays.length > 0 && !opDays.some((d: any) => d.day_of_week === dow)) continue

      ready++
    }

    return {
      date,
      aircraft_needed: aircraftNeeded,
      reserve_ratio: ratio,
      target,
      ready,
      shortfall: Math.max(target - ready, 0),
    }
  }
}
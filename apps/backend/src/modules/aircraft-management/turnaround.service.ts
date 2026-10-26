import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { DbService } from '@backend/db/db.service'
import { CreateTurnaroundDto, TURNAROUND_TASK_TYPES, UpdateTaskStatusDto } from './dto/turnaround.dto'
import { hasPrismaErrorCode, PRISMA_UNIQUE_VIOLATION } from './prisma-error'

export type TurnaroundTaskSummary = {
  id: string
  task_type: string
  status: string
  started_at: string | null
  completed_at: string | null
}

export type TurnaroundSummary = {
  id: string
  aircraft_id: string
  flight_id: string
  airport_code: string
  arrived_at: string
  is_ready: boolean
  ready_at: string | null
  tasks: TurnaroundTaskSummary[]
}

@Injectable()
export class TurnaroundService {
  constructor(private readonly db: DbService) {}

  /** Starts the ground-service session of a landed flight with the standard task set. */
  async create(aircraftId: string, dto: CreateTurnaroundDto): Promise<TurnaroundSummary> {
    const [aircraft, airport, flight] = await Promise.all([
      this.db.aircraft.findFirst({ where: { id: aircraftId, deleted_at: null }, select: { id: true } }),
      this.db.airport.findUnique({ where: { iata_code: dto.airport_code.trim().toUpperCase() }, select: { iata_code: true } }),
      this.db.flight.findFirst({ where: { id: dto.flight_id }, select: { id: true, aircraft_id: true } }),
    ])

    if (!aircraft) {
      throw new NotFoundException(`Aircraft with ID ${aircraftId} not found`)
    }
    if (!airport) {
      throw new NotFoundException(`Airport with code "${dto.airport_code}" not found`)
    }
    if (!flight) {
      throw new NotFoundException(`Flight with ID ${dto.flight_id} not found`)
    }

    if (flight.aircraft_id !== aircraftId) {
      throw new BadRequestException(`Flight ${dto.flight_id} is not operated by this aircraft`)
    }

    // One turnaround per flight: starting it again returns the one that exists, so a retry is safe.
    const existing = await this.findByFlight(dto.flight_id)
    if (existing) {
      return this.toSummary(existing)
    }

    const taskTypes = dto.tasks?.length ? dto.tasks.map((task) => task.task_type) : [...TURNAROUND_TASK_TYPES]
    if (new Set(taskTypes).size !== taskTypes.length) {
      throw new BadRequestException('Each task type can only appear once in a turnaround')
    }

    try {
      const turnaround = await this.db.aircraft_turnaround.create({
        data: {
          aircraft_id: aircraftId,
          flight_id: dto.flight_id,
          airport_code: airport.iata_code,
          arrived_at: new Date(dto.arrived_at),
          aircraft_turnaround_task: {
            create: taskTypes.map((taskType) => ({ task_type: taskType, status: 'pending' })),
          },
        },
        include: { aircraft_turnaround_task: true },
      })
      return this.toSummary(turnaround)
    } catch (error) {
      if (hasPrismaErrorCode(error, PRISMA_UNIQUE_VIOLATION)) {
        // Two requests for the same flight raced: the other one won, so answer with its turnaround.
        const winner = await this.findByFlight(dto.flight_id)
        if (winner) {
          return this.toSummary(winner)
        }
        throw new ConflictException('A turnaround is already open for this flight')
      }
      throw error
    }
  }

  private findByFlight(flightId: string) {
    return this.db.aircraft_turnaround.findFirst({
      where: { flight_id: flightId, deleted_at: null },
      include: { aircraft_turnaround_task: true },
    })
  }

  async getLatest(aircraftId: string): Promise<TurnaroundSummary | null> {
    const aircraft = await this.db.aircraft.findFirst({ where: { id: aircraftId, deleted_at: null }, select: { id: true } })
    if (!aircraft) {
      throw new NotFoundException(`Aircraft with ID ${aircraftId} not found`)
    }

    const turnaround = await this.db.aircraft_turnaround.findFirst({
      where: { aircraft_id: aircraftId, deleted_at: null },
      orderBy: { arrived_at: 'desc' },
      include: { aircraft_turnaround_task: true },
    })
    if (!turnaround) {
      return null
    }
    return this.toSummary(turnaround)
  }

  async updateTask(turnaroundId: string, taskId: string, dto: UpdateTaskStatusDto): Promise<TurnaroundTaskSummary> {
    const task = await this.db.aircraft_turnaround_task.findFirst({ where: { id: taskId, turnaround_id: turnaroundId } })
    if (!task) {
      throw new NotFoundException('Turnaround task not found')
    }

    const updateData: {
      status: string
      started_at?: Date | null
      completed_at?: Date | null
    } = { status: dto.status }

    // A task that goes back to an earlier state forgets the times of the later ones; otherwise a task that is completed again
    // would keep its first completion time, and the readiness time of the turnaround would be computed from it.
    if (dto.status === 'pending') {
      updateData.started_at = null
      updateData.completed_at = null
    } else if (dto.status === 'in_progress') {
      updateData.completed_at = null
    }

    if (dto.started_at !== undefined) {
      updateData.started_at = dto.started_at ? new Date(dto.started_at) : null
    } else if (dto.status === 'in_progress' && !task.started_at) {
      updateData.started_at = new Date()
    }

    if (dto.completed_at !== undefined) {
      updateData.completed_at = dto.completed_at ? new Date(dto.completed_at) : null
    } else if ((dto.status === 'completed' || dto.status === 'skipped') && !task.completed_at) {
      updateData.completed_at = new Date()
    }

    const updated = await this.db.aircraft_turnaround_task.update({ where: { id: taskId }, data: updateData })

    return {
      id: updated.id,
      task_type: updated.task_type,
      status: updated.status,
      started_at: updated.started_at ? updated.started_at.toISOString() : null,
      completed_at: updated.completed_at ? updated.completed_at.toISOString() : null,
    }
  }

  /** Readiness is derived from the tasks: a skipped task counts as finished. */
  private toSummary(turnaround: {
    id: string
    aircraft_id: string
    flight_id: string
    airport_code: string
    arrived_at: Date
    aircraft_turnaround_task: { id: string; task_type: string; status: string; started_at: Date | null; completed_at: Date | null }[]
  }): TurnaroundSummary {
    const tasks = turnaround.aircraft_turnaround_task ?? []
    const isReady = tasks.length > 0 && tasks.every((task) => task.status === 'completed' || task.status === 'skipped')
    const completionTimes = tasks.filter((task) => task.completed_at !== null).map((task) => (task.completed_at as Date).getTime())

    return {
      id: turnaround.id,
      aircraft_id: turnaround.aircraft_id,
      flight_id: turnaround.flight_id,
      airport_code: turnaround.airport_code,
      arrived_at: turnaround.arrived_at.toISOString(),
      is_ready: isReady,
      ready_at: isReady && completionTimes.length > 0 ? new Date(Math.max(...completionTimes)).toISOString() : null,
      tasks: tasks.map((task) => ({
        id: task.id,
        task_type: task.task_type,
        status: task.status,
        started_at: task.started_at ? task.started_at.toISOString() : null,
        completed_at: task.completed_at ? task.completed_at.toISOString() : null,
      })),
    }
  }
}

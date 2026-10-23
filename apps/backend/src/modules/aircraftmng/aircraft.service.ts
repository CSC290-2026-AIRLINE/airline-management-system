import { Injectable, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { DbService } from '../../db/db.service';
import { CreateAircraftDto } from '../dto/create-aircraft.dto';
import { CreateAircraftStatusDto } from '../dto/create-aircraft-status.dto';
import { CreateAircraftMaintenanceDto } from '../dto/create-aircraft-maintenance.dto';
import { UpdateAircraftMaintenanceDto } from '../dto/update-aircraft-maintenance.dto';
import { CreateTurnaroundDto, UpdateTaskStatusDto } from '../dto/turnaround.dto';
import { CreateRouteDto } from '../dto/create-route.dto'; // เพิ่ม Import DTO Route

@Injectable()
export class AircraftService {
  constructor(private readonly db: DbService) {}

  async findAll() {
    return this.db.aircraft.findMany({
      where: { deleted_at: null },
      include: {
        aircraft_status_period: {
          where: { deleted_at: null },
          orderBy: { start_date: 'desc' },
          take: 1,
        },
      },
    });
  }

  async create(createAircraftDto: CreateAircraftDto) {
    return this.db.aircraft.create({
      data: {
        tail_number: createAircraftDto.tailNumber,
        aircraft_type_id: createAircraftDto.type, 
        base_airport_code: createAircraftDto.base,
        entry_into_service_date: new Date(), 
      } as any, 
    });
  }

  async getStatusHistory(aircraftId: string) {
    return this.db.aircraft_status_period.findMany({
      where: { aircraft_id: aircraftId, deleted_at: null },
      orderBy: { start_date: 'desc' },
    });
  }

  async createStatus(aircraftId: string, dto: CreateAircraftStatusDto, staffId: string) {
    if (dto.status === 'in_maintenance') {
      throw new BadRequestException('in_maintenance can only be created via maintenance window');
    }

    const startDate = new Date(dto.start_date);
    const endDate = dto.end_date ? new Date(dto.end_date) : null;
    
    return this.db.aircraft_status_period.create({
      data: {
        aircraft_id: aircraftId,
        status: dto.status,
        origin: 'manual',
        reason: dto.reason,
        start_date: startDate,
        end_date: endDate,
        created_by: staffId, 
      },
    });
  }

  async removeStatus(aircraftId: string, periodId: string) {
    const period = await this.db.aircraft_status_period.findUnique({ where: { id: periodId } });
    if (!period) throw new NotFoundException('Status period not found');
    
    if (period.origin === 'maintenance') {
      throw new ConflictException('Cannot manually delete a period created by maintenance');
    }

    return this.db.aircraft_status_period.update({
      where: { id: periodId },
      data: { deleted_at: new Date() },
    });
  }

  async getMaintenanceList(aircraftId: string) {
    return this.db.aircraft_maintenance.findMany({
      where: { aircraft_id: aircraftId, deleted_at: null },
      orderBy: { planned_start_date: 'desc' },
    });
  }

  async createMaintenance(aircraftId: string, dto: CreateAircraftMaintenanceDto, staffId: string) {
    const startDate = new Date(dto.planned_start_date);
    const endDate = new Date(dto.planned_end_date);

    return this.db.$transaction(async (tx) => {
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
      });

      const maintenance = await tx.aircraft_maintenance.create({
        data: {
          aircraft_id: aircraftId,
          maintenance_type: dto.maintenance_type,
          planned_start_date: startDate,
          planned_end_date: endDate,
          status: 'planned',
          status_period_id: statusPeriod.id,
          created_by: staffId,
        },
      });

      return maintenance;
    });
  }

  async updateMaintenance(aircraftId: string, maintenanceId: string, dto: UpdateAircraftMaintenanceDto) {
    return this.db.aircraft_maintenance.update({
      where: { id: maintenanceId },
      data: dto as any,
    });
  }

  async createFlight(dto: {
    flight_number: string;
    service_date: string;
    scheduled_dep_at: string;
    scheduled_arr_at: string;
    dep_at?: string;
    arr_at?: string;
    route_id: string;
    aircraft_id: string;
  }) {
    return this.db.flight.create({
      data: {
        flight_number: dto.flight_number,
        service_date: new Date(dto.service_date),
        scheduled_dep_at: new Date(dto.scheduled_dep_at),
        scheduled_arr_at: new Date(dto.scheduled_arr_at),
        dep_at: dto.dep_at ? new Date(dto.dep_at) : new Date(dto.scheduled_dep_at),
        arr_at: dto.arr_at ? new Date(dto.arr_at) : new Date(dto.scheduled_arr_at),
        route_id: dto.route_id,
        aircraft_id: dto.aircraft_id,
      },
    });
  }

  async createTurnaround(aircraftId: string, dto: CreateTurnaroundDto) {
    return this.db.aircraft_turnaround.create({
      data: {
        aircraft_id: aircraftId,
        flight_id: dto.flight_id,
        airport_code: dto.airport_code,
        arrived_at: new Date(dto.arrived_at),
        aircraft_turnaround_task: {
          create: dto.tasks?.map(task => ({
            task_type: task.task_type,
            status: task.status || 'pending',
          })) || [],
        },
      },
      include: {
        aircraft_turnaround_task: true,
      },
    });
  }

  async updateTurnaroundTask(turnaroundId: string, taskType: string, dto: UpdateTaskStatusDto) {
    return this.db.aircraft_turnaround_task.update({
      where: {
        turnaround_id_task_type: {
          turnaround_id: turnaroundId,
          task_type: taskType,
        }
      },
      data: {
        status: dto.status,
        started_at: dto.started_at ? new Date(dto.started_at) : undefined,
        completed_at: dto.completed_at ? new Date(dto.completed_at) : undefined,
      },
    });
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
    });
  }
}
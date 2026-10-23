import { Injectable, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { DbService } from '../../db/db.service';
import { CreateAircraftDto } from '../dto/create-aircraft.dto';
import { CreateAircraftStatusDto } from '../dto/create-aircraft-status.dto';
import { CreateAircraftMaintenanceDto } from '../dto/create-aircraft-maintenance.dto';
import { UpdateAircraftMaintenanceDto } from '../dto/update-aircraft-maintenance.dto';

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
}
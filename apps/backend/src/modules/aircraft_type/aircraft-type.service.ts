import { Injectable, NotFoundException } from '@nestjs/common';
import { DbService } from '../../db/db.service';
import { CreateAircraftTypeDto } from '../dto/create-aircraft-type.dto';
import { UpdateAircraftTypeDto } from '../dto/update-aircraft-type.dto';

@Injectable()
export class AircraftTypeService {
  constructor(private readonly db: DbService) {}

  async create(data: CreateAircraftTypeDto) {
    return this.db.aircraft_type.create({
      data,
    });
  }

  async findAll() {
    return this.db.aircraft_type.findMany({
      where: { deleted_at: null }, 
      orderBy: { created_at: 'desc' },
    });
  }

  async findOne(id: string) {
    const aircraftType = await this.db.aircraft_type.findFirst({
      where: { id, deleted_at: null },
    });
    
    if (!aircraftType) {
      throw new NotFoundException(`Aircraft type with ID ${id} not found`);
    }
    return aircraftType;
  }

  async update(id: string, data: UpdateAircraftTypeDto) {
    await this.findOne(id); 

    return this.db.aircraft_type.update({
      where: { id },
      data: {
        ...data,
        updated_at: new Date(),
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);

    return this.db.aircraft_type.update({
      where: { id },
      data: { deleted_at: new Date() },
    });
  }
}
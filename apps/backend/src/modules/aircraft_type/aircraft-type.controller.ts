import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { AircraftTypeService } from './aircraft-type.service';
import { CreateAircraftTypeDto } from '../dto/create-aircraft-type.dto';
import { UpdateAircraftTypeDto } from '../dto/update-aircraft-type.dto';

@Controller('aircraft-types')
export class AircraftTypeController {
  constructor(private readonly aircraftTypeService: AircraftTypeService) {}

  @Post()
  create(@Body() createAircraftTypeDto: CreateAircraftTypeDto) {
    return this.aircraftTypeService.create(createAircraftTypeDto);
  }

  @Get()
  findAll() {
    return this.aircraftTypeService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.aircraftTypeService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string, 
    @Body() updateAircraftTypeDto: UpdateAircraftTypeDto
  ) {
    return this.aircraftTypeService.update(id, updateAircraftTypeDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.aircraftTypeService.remove(id);
  }
}
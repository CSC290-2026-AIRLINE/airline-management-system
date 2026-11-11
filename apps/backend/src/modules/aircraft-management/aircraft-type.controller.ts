import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, UseFilters, UseGuards, UsePipes } from '@nestjs/common'
import { AircraftTypeService } from './aircraft-type.service'
import { ApiExceptionFilter } from './api-exception.filter'
import { ApiValidationPipe } from './api-validation.pipe'
import { CloneAircraftTypeDto, CreateAircraftTypeDto, UpdateAircraftTypeDto } from './dto/aircraft-type.dto'
import { StaffGuard } from './staff.guard'

@Controller('aircraft-types')
@UseGuards(StaffGuard)
@UseFilters(ApiExceptionFilter)
@UsePipes(ApiValidationPipe)
export class AircraftTypeController {
  constructor(private readonly aircraftTypeService: AircraftTypeService) {}

  @Get()
  findAll() {
    return this.aircraftTypeService.findAll()
  }

  @Post()
  create(@Body() dto: CreateAircraftTypeDto) {
    return this.aircraftTypeService.create(dto)
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.aircraftTypeService.findOne(id)
  }

  @Put(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAircraftTypeDto) {
    return this.aircraftTypeService.update(id, dto)
  }

  @Post(':id/clone')
  clone(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CloneAircraftTypeDto) {
    return this.aircraftTypeService.clone(id, dto)
  }
}

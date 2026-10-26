import { Body, Controller, Get, Param, Post, Put, UseGuards, UsePipes } from '@nestjs/common'
import { AircraftTypeService } from './aircraft-type.service'
import { ApiValidationPipe } from './api-validation.pipe'
import { CloneAircraftTypeDto, CreateAircraftTypeDto, UpdateAircraftTypeDto } from './dto/aircraft-type.dto'
import { StaffGuard } from './staff.guard'

@Controller('aircraft-types')
@UsePipes(ApiValidationPipe)
export class AircraftTypeController {
  constructor(private readonly aircraftTypeService: AircraftTypeService) {}

  @Get()
  findAll() {
    return this.aircraftTypeService.findAll()
  }

  @UseGuards(StaffGuard)
  @Post()
  create(@Body() dto: CreateAircraftTypeDto) {
    return this.aircraftTypeService.create(dto)
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.aircraftTypeService.findOne(id)
  }

  @UseGuards(StaffGuard)
  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAircraftTypeDto) {
    return this.aircraftTypeService.update(id, dto)
  }

  @UseGuards(StaffGuard)
  @Post(':id/clone')
  clone(@Param('id') id: string, @Body() dto: CloneAircraftTypeDto) {
    return this.aircraftTypeService.clone(id, dto)
  }
}

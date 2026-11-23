import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, UseFilters, UseGuards, UsePipes } from '@nestjs/common'
import { CurrentUser } from '@backend/auth/decorators/current-user.decorator'
import type { AuthenticatedUser } from '@backend/auth/guards/jwt-auth.guard'
import { CurrentStaffService } from './current-staff.service'
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
  constructor(
    private readonly aircraftTypeService: AircraftTypeService,
    private readonly currentStaff: CurrentStaffService,
  ) {}

  @Get()
  findAll() {
    return this.aircraftTypeService.findAll()
  }

  @Post()
  async create(@Body() dto: CreateAircraftTypeDto, @CurrentUser() user: AuthenticatedUser) {
    const staffId = await this.currentStaff.resolveStaffId(user.id)
    return this.aircraftTypeService.create(dto, staffId)
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.aircraftTypeService.findOne(id)
  }

  @Put(':id')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAircraftTypeDto, @CurrentUser() user: AuthenticatedUser) {
    const staffId = await this.currentStaff.resolveStaffId(user.id)
    return this.aircraftTypeService.update(id, dto, staffId)
  }

  @Post(':id/clone')
  async clone(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CloneAircraftTypeDto, @CurrentUser() user: AuthenticatedUser) {
    const staffId = await this.currentStaff.resolveStaffId(user.id)
    return this.aircraftTypeService.clone(id, dto, staffId)
  }
}

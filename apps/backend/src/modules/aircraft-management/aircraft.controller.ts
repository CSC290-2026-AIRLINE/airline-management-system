import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards, UsePipes } from '@nestjs/common'
import { CurrentUser } from '@backend/auth/decorators/current-user.decorator'
import type { AuthenticatedUser } from '@backend/auth/guards/jwt-auth.guard'
import { AircraftService } from './aircraft.service'
import { ApiValidationPipe } from './api-validation.pipe'
import { CurrentStaffService } from './current-staff.service'
import {
  AircraftListQueryDto,
  AvailabilityQueryDto,
  CreateAircraftDto,
  CreateAircraftMaintenanceDto,
  CreateAircraftStatusDto,
  SetOperatingDaysDto,
  StatusChangesQueryDto,
  UpdateAircraftDto,
  UpdateAircraftMaintenanceDto,
} from './dto/aircraft.dto'
import { StaffGuard } from './staff.guard'

@Controller('aircraft')
@UsePipes(ApiValidationPipe)
export class AircraftController {
  constructor(
    private readonly aircraftService: AircraftService,
    private readonly currentStaff: CurrentStaffService,
  ) {}

  @Get()
  findAll(@Query() query: AircraftListQueryDto) {
    return this.aircraftService.findAll(query)
  }

  @UseGuards(StaffGuard)
  @Post()
  async create(@Body() dto: CreateAircraftDto, @CurrentUser() user: AuthenticatedUser) {
    const staffId = await this.currentStaff.resolveStaffId(user.id)
    return this.aircraftService.create(dto, staffId)
  }

  @Get('available')
  getAvailable(@Query() query: AvailabilityQueryDto) {
    return this.aircraftService.getAvailableAircraft(query)
  }

  @Get('status-changes')
  getStatusChanges(@Query() query: StatusChangesQueryDto) {
    return this.aircraftService.getStatusChanges(query)
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.aircraftService.findOne(id)
  }

  @UseGuards(StaffGuard)
  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAircraftDto) {
    return this.aircraftService.update(id, dto)
  }

  @Get(':id/status')
  getStatus(@Param('id') id: string) {
    return this.aircraftService.getStatus(id)
  }

  @UseGuards(StaffGuard)
  @Post(':id/status')
  async createStatus(@Param('id') id: string, @Body() dto: CreateAircraftStatusDto, @CurrentUser() user: AuthenticatedUser) {
    const staffId = await this.currentStaff.resolveStaffId(user.id)
    return this.aircraftService.createStatus(id, dto, staffId)
  }

  @UseGuards(StaffGuard)
  @Delete(':id/status/:periodId')
  removeStatus(@Param('id') id: string, @Param('periodId') periodId: string) {
    return this.aircraftService.removeStatus(id, periodId)
  }

  @Get(':id/status/history')
  getStatusHistory(@Param('id') id: string) {
    return this.aircraftService.getStatusHistory(id)
  }

  @Get(':id/seat-map')
  getSeatMap(@Param('id') id: string) {
    return this.aircraftService.getSeatMap(id)
  }

  @Get(':id/capacity')
  getCapacity(@Param('id') id: string) {
    return this.aircraftService.getCapacity(id)
  }

  @Get(':id/availability')
  getAvailability(@Param('id') id: string, @Query() query: AvailabilityQueryDto) {
    return this.aircraftService.getAvailability(id, query)
  }

  @Get(':id/maintenance')
  getMaintenanceList(@Param('id') id: string) {
    return this.aircraftService.getMaintenanceList(id)
  }

  @UseGuards(StaffGuard)
  @Post(':id/maintenance')
  async createMaintenance(@Param('id') id: string, @Body() dto: CreateAircraftMaintenanceDto, @CurrentUser() user: AuthenticatedUser) {
    const staffId = await this.currentStaff.resolveStaffId(user.id)
    return this.aircraftService.createMaintenance(id, dto, staffId)
  }

  @UseGuards(StaffGuard)
  @Put(':id/maintenance/:maintenanceId')
  updateMaintenance(@Param('id') id: string, @Param('maintenanceId') maintenanceId: string, @Body() dto: UpdateAircraftMaintenanceDto) {
    return this.aircraftService.updateMaintenance(id, maintenanceId, dto)
  }

  @Get(':id/operating-days')
  getOperatingDays(@Param('id') id: string) {
    return this.aircraftService.getOperatingDays(id)
  }

  @UseGuards(StaffGuard)
  @Put(':id/operating-days')
  setOperatingDays(@Param('id') id: string, @Body() dto: SetOperatingDaysDto) {
    return this.aircraftService.setOperatingDays(id, dto)
  }
}

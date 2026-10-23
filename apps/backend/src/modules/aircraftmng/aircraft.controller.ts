import { Controller, Get, Post, Put, Patch, Delete, Body, Param } from '@nestjs/common';
import { AircraftService } from './aircraft.service';
import { CreateAircraftDto } from '../dto/create-aircraft.dto';
import { CreateAircraftStatusDto } from '../dto/create-aircraft-status.dto';
import { CreateAircraftMaintenanceDto } from '../dto/create-aircraft-maintenance.dto';
import { UpdateAircraftMaintenanceDto } from '../dto/update-aircraft-maintenance.dto';
import { CreateTurnaroundDto, UpdateTaskStatusDto } from '../dto/turnaround.dto';
import { CreateRouteDto } from '../dto/create-route.dto'; 
import { Public } from '../../auth/decorators/public.decorator'; 

@Controller('aircraft')
export class AircraftController {
  constructor(private readonly aircraftService: AircraftService) {}

  private readonly MOCK_STAFF_ID = '80222509-c29f-4806-accd-9c041ed06d47';

  @Public()
  @Get()
  findAll() {
    return this.aircraftService.findAll();
  }

  @Public() 
  @Post()
  create(@Body() createAircraftDto: CreateAircraftDto) {
    return this.aircraftService.create(createAircraftDto);
  }

  @Public()
  @Post('routes')
  createRoute(@Body() dto: CreateRouteDto) {
    return this.aircraftService.createRoute(dto);
  }
  // ----------------------------------------

  @Public()
  @Get(':id/status/history')
  getStatusHistory(@Param('id') id: string) {
    return this.aircraftService.getStatusHistory(id);
  }

  @Public()
  @Post(':id/status')
  createStatus(@Param('id') id: string, @Body() dto: CreateAircraftStatusDto) {
    return this.aircraftService.createStatus(id, dto, this.MOCK_STAFF_ID);
  }

  @Public()
  @Delete(':id/status/:periodId')
  removeStatus(@Param('id') id: string, @Param('periodId') periodId: string) {
    return this.aircraftService.removeStatus(id, periodId);
  }

  @Public()
  @Get(':id/maintenance')
  getMaintenanceList(@Param('id') id: string) {
    return this.aircraftService.getMaintenanceList(id);
  }

  @Public()
  @Post(':id/maintenance')
  createMaintenance(@Param('id') id: string, @Body() dto: CreateAircraftMaintenanceDto) {
    return this.aircraftService.createMaintenance(id, dto, this.MOCK_STAFF_ID);
  }
  
  @Public()
  @Post('flights')
  createFlight(@Body() dto: any) {
    return this.aircraftService.createFlight(dto);
  }

  @Public()
  @Put(':id/maintenance/:maintenanceId')
  updateMaintenance(
    @Param('id') id: string, 
    @Param('maintenanceId') maintenanceId: string, 
    @Body() dto: UpdateAircraftMaintenanceDto
  ) {
    return this.aircraftService.updateMaintenance(id, maintenanceId, dto);
  }

  @Public()
  @Post(':id/turnaround')
  createTurnaround(
    @Param('id') aircraftId: string,
    @Body() dto: CreateTurnaroundDto,
  ) {
    return this.aircraftService.createTurnaround(aircraftId, dto);
  }

  @Public()
  @Patch('turnaround/:turnaroundId/tasks/:taskType')
  updateTurnaroundTask(
    @Param('turnaroundId') turnaroundId: string,
    @Param('taskType') taskType: string,
    @Body() dto: UpdateTaskStatusDto,
  ) {
    return this.aircraftService.updateTurnaroundTask(turnaroundId, taskType, dto);
  }
}
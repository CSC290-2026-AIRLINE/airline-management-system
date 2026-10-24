import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common'
import { AircraftService } from './aircraft.service'
import { CreateAircraftDto } from '../dto/create-aircraft.dto'
import { CreateAircraftStatusDto } from '../dto/create-aircraft-status.dto'
import { CreateAircraftMaintenanceDto } from '../dto/create-aircraft-maintenance.dto'
import { UpdateAircraftMaintenanceDto } from '../dto/update-aircraft-maintenance.dto'
import { CreateTurnaroundDto } from '../dto/turnaround.dto'
import { CreateRouteDto } from '../dto/create-route.dto'
import { CreateOperatingDayDto } from '../dto/create-operating-day.dto'
import { Public } from '../../auth/decorators/public.decorator'

@Controller('aircraft')
export class AircraftController {
  constructor(private readonly aircraftService: AircraftService) {}

  // 1. GET /aircraft - List fleet with filters
  @Public()
  @Get()
  findAll(
    @Query('type') type?: string,
    @Query('base') base?: string,
    @Query('status') status?: string,
  ) {
    return this.aircraftService.findAll({ type, base, status })
  }

  // 2. POST /aircraft - Register aircraft
  @Public()
  @Post()
  create(@Body() createAircraftDto: CreateAircraftDto) {
    return this.aircraftService.create(createAircraftDto)
  }

  // 3. GET /aircraft/available (must precede :id)
  @Public()
  @Get('available')
  getAvailable(
    @Query('type') type?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('dep_date') depDate?: string,
    @Query('distance_km') distanceKm?: string,
  ) {
    return this.aircraftService.getAvailableAircraft({
      type,
      from,
      to,
      dep_date: depDate,
      distance_km: distanceKm,
    })
  }

  // 4. GET /aircraft/status-changes (must precede :id)
  @Public()
  @Get('status-changes')
  getStatusChanges(@Query('since') since: string) {
    return this.aircraftService.getStatusChanges(since || new Date(0).toISOString())
  }

  // 5. GET /aircraft/:id - Detail with current status
  @Public()
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.aircraftService.findOne(id)
  }

  // 6. PUT /aircraft/:id - Edit registry fields or retire
  @Public()
  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() body: { tail_number?: string; base_airport_code?: string; retired_on?: string | null },
  ) {
    return this.aircraftService.update(id, body)
  }

  // 7. GET /aircraft/:id/status - Status at simulated date
  @Public()
  @Get(':id/status')
  getStatus(@Param('id') id: string) {
    return this.aircraftService.getStatus(id)
  }

  // 8. POST /aircraft/:id/status - Set status period
  @Public()
  @Post(':id/status')
  createStatus(@Param('id') id: string, @Body() dto: CreateAircraftStatusDto) {
    return this.aircraftService.createStatus(id, dto)
  }

  // 9. DELETE /aircraft/:id/status/:periodId - Cancel status period
  @Public()
  @Delete(':id/status/:periodId')
  removeStatus(@Param('id') id: string, @Param('periodId') periodId: string) {
    return this.aircraftService.removeStatus(id, periodId)
  }

  // 10. GET /aircraft/:id/status/history
  @Public()
  @Get(':id/status/history')
  getStatusHistory(@Param('id') id: string) {
    return this.aircraftService.getStatusHistory(id)
  }

  // 11. GET /aircraft/:id/seat-map
  @Public()
  @Get(':id/seat-map')
  getSeatMap(@Param('id') id: string) {
    return this.aircraftService.getSeatMap(id)
  }

  // 12. GET /aircraft/:id/capacity
  @Public()
  @Get(':id/capacity')
  getCapacity(@Param('id') id: string) {
    return this.aircraftService.getCapacity(id)
  }

  // 13. GET /aircraft/:id/availability
  @Public()
  @Get(':id/availability')
  getAvailability(
    @Param('id') id: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('dep_date') depDate?: string,
    @Query('distance_km') distanceKm?: string,
  ) {
    return this.aircraftService.getAvailability(id, {
      from,
      to,
      dep_date: depDate,
      distance_km: distanceKm,
    })
  }

  // 14. GET /aircraft/:id/maintenance
  @Public()
  @Get(':id/maintenance')
  getMaintenanceList(@Param('id') id: string) {
    return this.aircraftService.getMaintenanceList(id)
  }

  // 15. POST /aircraft/:id/maintenance
  @Public()
  @Post(':id/maintenance')
  createMaintenance(@Param('id') id: string, @Body() dto: CreateAircraftMaintenanceDto) {
    return this.aircraftService.createMaintenance(id, dto)
  }

  // 16. PUT /aircraft/:id/maintenance/:maintenanceId
  @Public()
  @Put(':id/maintenance/:maintenanceId')
  updateMaintenance(
    @Param('id') id: string,
    @Param('maintenanceId') maintenanceId: string,
    @Body() dto: UpdateAircraftMaintenanceDto,
  ) {
    return this.aircraftService.updateMaintenance(id, maintenanceId, dto)
  }

  // 17. GET /aircraft/:id/operating-days
  @Public()
  @Get(':id/operating-days')
  getOperatingDays(@Param('id') id: string) {
    return this.aircraftService.getOperatingDays(id)
  }

  // 18. PUT /aircraft/:id/operating-days
  @Public()
  @Put(':id/operating-days')
  setOperatingDays(@Param('id') id: string, @Body() dto: CreateOperatingDayDto) {
    return this.aircraftService.setOperatingDays(id, dto.days || [])
  }

  // 19. POST /aircraft/:id/turnarounds
  @Public()
  @Post(':id/turnarounds')
  createTurnaround(@Param('id') aircraftId: string, @Body() dto: CreateTurnaroundDto) {
    return this.aircraftService.createTurnaround(aircraftId, dto)
  }

  @Public()
  @Post(':id/turnaround')
  createTurnaroundAlias(@Param('id') aircraftId: string, @Body() dto: CreateTurnaroundDto) {
    return this.aircraftService.createTurnaround(aircraftId, dto)
  }

  // 20. GET /aircraft/:id/turnarounds/latest
  @Public()
  @Get(':id/turnarounds/latest')
  getLatestTurnaround(@Param('id') aircraftId: string) {
    return this.aircraftService.getLatestTurnaround(aircraftId)
  }

  @Public()
  @Post('routes')
  createRoute(@Body() dto: CreateRouteDto) {
    return this.aircraftService.createRoute(dto)
  }

  @Public()
  @Post('flights')
  createFlight(@Body() dto: any) {
    return this.aircraftService.createFlight(dto)
  }
}
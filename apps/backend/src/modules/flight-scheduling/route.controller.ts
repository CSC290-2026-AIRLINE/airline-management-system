import { Body, Controller, Get, Param, Post, Put, Query, UseGuards, UseFilters } from '@nestjs/common'
import { StaffGuard } from './operations/staff.guard'
import type { ListRoutesQueryDto } from './dto/route.dto'
import { RouteService } from './route.service'
import { FlightErrorFilter } from './flight-error.filter'

@UseFilters(FlightErrorFilter)
@Controller('flight-scheduling/routes')
export class RouteController {
  constructor(private readonly routeService: RouteService) {}

  @Get()
  list(@Query() query: ListRoutesQueryDto) {
    return this.routeService.list(query)
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.routeService.get(id)
  }

  @UseGuards(StaffGuard)
  @Post()
  create(@Body() body: unknown) {
    return this.routeService.create(body)
  }

  @UseGuards(StaffGuard)
  @Put(':id')
  update(@Param('id') id: string, @Body() body: unknown) {
    return this.routeService.update(id, body)
  }
}

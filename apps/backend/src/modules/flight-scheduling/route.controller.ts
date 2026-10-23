import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common'
import { Public } from '@backend/auth/decorators/public.decorator'
import type { ListRoutesQueryDto } from './dto/route.dto'
import { RouteService } from './route.service'

// TEMP-NO-LOGIN: every route here is open for local testing; remove this @Public() before committing.
@Public()
@Controller('flight-scheduling/routes')
export class RouteController {
  constructor(private readonly routeService: RouteService) {}

  // ponytail: TEMP public, see FlightSchedulingController.listFlights.
  @Public()
  @Get()
  list(@Query() query: ListRoutesQueryDto) {
    return this.routeService.list(query)
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.routeService.get(id)
  }

  @Post()
  create(@Body() body: unknown) {
    return this.routeService.create(body)
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: unknown) {
    return this.routeService.update(id, body)
  }
}

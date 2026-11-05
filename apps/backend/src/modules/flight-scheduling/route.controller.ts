import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common'
import type { ListRoutesQueryDto } from './dto/route.dto'
import { RouteService } from './route.service'

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

  @Post()
  create(@Body() body: unknown) {
    return this.routeService.create(body)
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: unknown) {
    return this.routeService.update(id, body)
  }
}

import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common'
import { CongestionService } from './congestion.service'

@Controller('flight-scheduling/congestion')
export class CongestionController {
  constructor(private readonly congestionService: CongestionService) {}

  @Get()
  list(@Query() query: { airport?: string }) {
    return this.congestionService.list(query)
  }

  @Post()
  create(@Body() body: unknown) {
    return this.congestionService.create(body)
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.congestionService.remove(id)
  }
}

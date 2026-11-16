import { Body, Controller, HttpCode, Post, UseFilters } from '@nestjs/common'
import { ScheduleBuilderService } from './schedule-builder.service'
import { FlightErrorFilter } from './flight-error.filter'

@UseFilters(FlightErrorFilter)
@Controller('flight-scheduling/flights/generate')
export class ScheduleBuilderController {
  constructor(private readonly scheduleBuilderService: ScheduleBuilderService) {}

  // A preview from patterns or one one-off flight; nothing is saved.
  @Post()
  @HttpCode(200)
  generate(@Body() body: unknown) {
    return this.scheduleBuilderService.preview(body)
  }
}

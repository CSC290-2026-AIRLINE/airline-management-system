import { Body, Controller, HttpCode, Post } from '@nestjs/common'
import { ScheduleBuilderService } from './schedule-builder.service'

@Controller('flight-scheduling/schedule-builder')
export class ScheduleBuilderController {
  constructor(private readonly scheduleBuilderService: ScheduleBuilderService) {}

  @Post('preview')
  @HttpCode(200) // nothing is created
  preview(@Body() body: unknown) {
    return this.scheduleBuilderService.preview(body)
  }
}

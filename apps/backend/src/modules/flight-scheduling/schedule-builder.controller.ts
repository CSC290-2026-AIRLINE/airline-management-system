import { Public } from '@backend/auth/decorators/public.decorator'
import { Body, Controller, HttpCode, Post } from '@nestjs/common'
import { ScheduleBuilderService } from './schedule-builder.service'

// TEMP-NO-LOGIN: every route here is open for local testing; remove this @Public() before committing.
@Public()
@Controller('flight-scheduling/schedule-builder')
export class ScheduleBuilderController {
  constructor(private readonly scheduleBuilderService: ScheduleBuilderService) {}

  @Post('preview')
  @HttpCode(200) // nothing is created
  preview(@Body() body: unknown) {
    return this.scheduleBuilderService.preview(body)
  }
}

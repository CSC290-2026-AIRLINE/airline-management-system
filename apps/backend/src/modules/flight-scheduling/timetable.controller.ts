import { Public } from '@backend/auth/decorators/public.decorator'
import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common'
import type { ListTimetablesQueryDto } from './dto/timetable.dto'
import { TimetableService } from './timetable.service'

// TEMP-NO-LOGIN: every route here is open for local testing; remove this @Public() before committing.
@Public()
@Controller('flight-scheduling/timetables')
export class TimetableController {
  constructor(private readonly timetableService: TimetableService) {}

  @Get()
  list(@Query() query: ListTimetablesQueryDto) {
    return this.timetableService.list(query)
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.timetableService.get(id)
  }

  @Post()
  create(@Body() body: unknown) {
    return this.timetableService.create(body)
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: unknown) {
    return this.timetableService.update(id, body)
  }
}

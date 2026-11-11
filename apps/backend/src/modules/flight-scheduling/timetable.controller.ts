import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common'
import { StaffGuard } from './operations/staff.guard'
import type { ListTimetablesQueryDto } from './dto/timetable.dto'
import { TimetableService } from './timetable.service'

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

  @UseGuards(StaffGuard)
  @Post()
  create(@Body() body: unknown) {
    return this.timetableService.create(body)
  }

  @UseGuards(StaffGuard)
  @Put(':id')
  update(@Param('id') id: string, @Body() body: unknown) {
    return this.timetableService.update(id, body)
  }
}

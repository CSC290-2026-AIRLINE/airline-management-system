import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, UseGuards, UsePipes } from '@nestjs/common'
import { ApiValidationPipe } from './api-validation.pipe'
import { CreateTurnaroundDto, UpdateTaskStatusDto } from './dto/turnaround.dto'
import { TurnaroundService } from './turnaround.service'
import { StaffGuard } from './staff.guard'

@Controller()
@UseGuards(StaffGuard)
@UsePipes(ApiValidationPipe)
export class TurnaroundController {
  constructor(private readonly turnaroundService: TurnaroundService) {}

  @Post('aircraft/:id/turnarounds')
  create(@Param('id', ParseUUIDPipe) aircraftId: string, @Body() dto: CreateTurnaroundDto) {
    return this.turnaroundService.create(aircraftId, dto)
  }

  @Get('aircraft/:id/turnarounds/latest')
  getLatest(@Param('id', ParseUUIDPipe) aircraftId: string) {
    return this.turnaroundService.getLatest(aircraftId)
  }

  @Put('turnarounds/:id/tasks/:taskId')
  updateTask(
    @Param('id', ParseUUIDPipe) turnaroundId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: UpdateTaskStatusDto,
  ) {
    return this.turnaroundService.updateTask(turnaroundId, taskId, dto)
  }
}

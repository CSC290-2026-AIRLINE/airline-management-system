import { Body, Controller, Get, Param, Post, Put, UseGuards, UsePipes } from '@nestjs/common'
import { ApiValidationPipe } from './api-validation.pipe'
import { CreateTurnaroundDto, UpdateTaskStatusDto } from './dto/turnaround.dto'
import { TurnaroundService } from './turnaround.service'
import { StaffGuard } from './staff.guard'

@Controller()
@UsePipes(ApiValidationPipe)
export class TurnaroundController {
  constructor(private readonly turnaroundService: TurnaroundService) {}

  @UseGuards(StaffGuard)
  @Post('aircraft/:id/turnarounds')
  create(@Param('id') aircraftId: string, @Body() dto: CreateTurnaroundDto) {
    return this.turnaroundService.create(aircraftId, dto)
  }

  @Get('aircraft/:id/turnarounds/latest')
  getLatest(@Param('id') aircraftId: string) {
    return this.turnaroundService.getLatest(aircraftId)
  }

  @UseGuards(StaffGuard)
  @Put('turnarounds/:id/tasks/:taskId')
  updateTask(@Param('id') turnaroundId: string, @Param('taskId') taskId: string, @Body() dto: UpdateTaskStatusDto) {
    return this.turnaroundService.updateTask(turnaroundId, taskId, dto)
  }
}

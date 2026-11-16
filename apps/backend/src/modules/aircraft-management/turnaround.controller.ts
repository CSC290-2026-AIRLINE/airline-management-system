import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, UseFilters, UseGuards, UsePipes } from '@nestjs/common'
import { CurrentUser } from '@backend/auth/decorators/current-user.decorator'
import type { AuthenticatedUser } from '@backend/auth/guards/jwt-auth.guard'
import { CurrentStaffService } from './current-staff.service'
import { ApiExceptionFilter } from './api-exception.filter'
import { ApiValidationPipe } from './api-validation.pipe'
import { CreateTurnaroundDto, UpdateTaskStatusDto } from './dto/turnaround.dto'
import { TurnaroundService } from './turnaround.service'
import { StaffGuard } from './staff.guard'

@Controller()
@UseGuards(StaffGuard)
@UseFilters(ApiExceptionFilter)
@UsePipes(ApiValidationPipe)
export class TurnaroundController {
  constructor(
    private readonly turnaroundService: TurnaroundService,
    private readonly currentStaff: CurrentStaffService,
  ) {}

  @Post('aircraft/:id/turnarounds')
  async create(@Param('id', ParseUUIDPipe) aircraftId: string, @Body() dto: CreateTurnaroundDto, @CurrentUser() user: AuthenticatedUser) {
    const staffId = await this.currentStaff.resolveStaffId(user.id)
    return this.turnaroundService.create(aircraftId, dto, staffId)
  }

  @Get('aircraft/:id/turnarounds/latest')
  getLatest(@Param('id', ParseUUIDPipe) aircraftId: string) {
    return this.turnaroundService.getLatest(aircraftId)
  }

  @Put('turnarounds/:id/tasks/:taskId')
  async updateTask(
    @Param('id', ParseUUIDPipe) turnaroundId: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: UpdateTaskStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const staffId = await this.currentStaff.resolveStaffId(user.id)
    return this.turnaroundService.updateTask(turnaroundId, taskId, dto, staffId)
  }
}

import { Controller, Put, Param, Body } from '@nestjs/common'
import { AircraftService } from './aircraft.service'
import { UpdateTaskStatusDto } from '../dto/turnaround.dto'
import { Public } from '../../auth/decorators/public.decorator'

@Controller('turnarounds')
export class TurnaroundController {
  constructor(private readonly aircraftService: AircraftService) {}

  @Public()
  @Put(':id/tasks/:taskId')
  updateTask(
    @Param('id') turnaroundId: string,
    @Param('taskId') taskId: string,
    @Body() dto: UpdateTaskStatusDto,
  ) {
    return this.aircraftService.updateTurnaroundTask(turnaroundId, taskId, dto)
  }
}

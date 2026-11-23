import { Body, Controller, Get, Param, Put, UseGuards, UseFilters } from '@nestjs/common'
import { StaffGuard } from './staff.guard'
import { ApprovalPolicyService } from './approval-policy.service'
import { FlightErrorFilter } from '../flight-error.filter'

@UseFilters(FlightErrorFilter)
@Controller('flight-scheduling/airports/:iata/approval-policy')
export class ApprovalPolicyController {
  constructor(private readonly policies: ApprovalPolicyService) {}

  @Get()
  get(@Param('iata') iata: string) {
    return this.policies.get(iata)
  }

  @UseGuards(StaffGuard)
  @Put()
  save(@Param('iata') iata: string, @Body() body: unknown) {
    return this.policies.save(iata, body)
  }
}

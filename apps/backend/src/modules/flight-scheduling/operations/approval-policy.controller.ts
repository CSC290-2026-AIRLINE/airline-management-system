import { Body, Controller, Get, Param, Put } from '@nestjs/common'
import { ApprovalPolicyService } from './approval-policy.service'

@Controller('flight-scheduling/airports/:iata/approval-policy')
export class ApprovalPolicyController {
  constructor(private readonly policies: ApprovalPolicyService) {}

  @Get()
  get(@Param('iata') iata: string) {
    return this.policies.get(iata)
  }

  @Put()
  save(@Param('iata') iata: string, @Body() body: unknown) {
    return this.policies.save(iata, body)
  }
}

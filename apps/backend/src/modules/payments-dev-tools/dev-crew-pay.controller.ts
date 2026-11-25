import { Controller, Delete, Get, HttpCode, Post, UseGuards } from '@nestjs/common'
import { CurrentUser } from '@backend/auth/decorators/current-user.decorator'
import type { AuthenticatedUser } from '@backend/auth/guards/jwt-auth.guard'
import { DevCrewPayService, type DevCrewPaySeedDto, type DevCrewPayStatusDto } from './dev-crew-pay.service'
import { DevToolsGuard } from './dev-tools.guard'

/**
 * TODO(F5-dev): delete with the rest of `payments-dev-tools` before the PR merges.
 *
 * Sample crew work for Pay Runs and My Pay, until Feature 8 has real pairings. 404 unless `PAYMENT_DEV_TOOLS` is on.
 */
@Controller('dev/crew-pay')
@UseGuards(DevToolsGuard)
export class DevCrewPayController {
  constructor(private readonly crewPay: DevCrewPayService) {}

  @Get()
  status(@CurrentUser() user: AuthenticatedUser): Promise<DevCrewPayStatusDto> {
    return this.crewPay.status(user.id)
  }

  @Post('seed')
  @HttpCode(200)
  seed(@CurrentUser() user: AuthenticatedUser): Promise<DevCrewPaySeedDto> {
    return this.crewPay.seed(user.id)
  }

  @Post('draft-run')
  @HttpCode(200)
  draftRun(@CurrentUser() user: AuthenticatedUser): Promise<{ run_id: string; created_by: string; lines: number }> {
    return this.crewPay.draftRun(user.id)
  }

  @Delete()
  @HttpCode(200)
  remove(): Promise<Record<string, number>> {
    return this.crewPay.remove()
  }
}

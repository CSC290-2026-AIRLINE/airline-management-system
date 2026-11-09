import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common'
import { CurrentUser } from '@backend/auth/decorators/current-user.decorator'
import type { AuthenticatedUser } from '@backend/auth/guards/jwt-auth.guard'
import { parseApprovalRequestBody, parseRespondBody, parseReviseBody } from '../dto/approval.dto'
import { ApprovalService, type ListApprovalsQueryDto } from './approval.service'
import { StaffActorService } from './staff-actor.service'

// Approval writes always need a staff member, because every request and answer records who made it.
@Controller('flight-scheduling/approvals')
export class ApprovalController {
  constructor(
    private readonly approvals: ApprovalService,
    private readonly actors: StaffActorService,
  ) {}

  @Get()
  list(@Query() query: ListApprovalsQueryDto) {
    return this.approvals.list(query)
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.approvals.get(id)
  }

  @Post()
  @HttpCode(201)
  async create(@Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const input = parseApprovalRequestBody(body)
    return this.approvals.create(input, await this.actors.staffIdFor(user))
  }

  @Post(':id/respond')
  @HttpCode(200)
  async respond(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const input = parseRespondBody(body)
    return this.approvals.respond(id, input, await this.actors.staffIdFor(user))
  }

  @Post(':id/revise')
  @HttpCode(201)
  async revise(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const input = parseReviseBody(body)
    return this.approvals.revise(id, input, await this.actors.staffIdFor(user))
  }
}

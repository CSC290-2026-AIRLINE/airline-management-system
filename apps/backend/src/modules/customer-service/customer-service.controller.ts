import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, UsePipes, ValidationPipe } from '@nestjs/common'
import { CurrentUser } from '@backend/auth/decorators/current-user.decorator'
import type { AuthenticatedUser } from '@backend/auth/guards/jwt-auth.guard'
import { CustomerServiceService } from './customer-service.service'
import { CreateComplaintDto } from './dto/create-complaint.dto'
import { AddCaseNoteDto, UpdateCaseStatusDto } from './dto/staff-actions.dto'

// Scoped to this module, like pricing's pipe: other teams' endpoints keep their own rules.
const validation = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })

/** The signed-in customer's own complaints. */
@Controller('complaints')
@UsePipes(validation)
export class CustomerComplaintsController {
  constructor(private readonly service: CustomerServiceService) {}

  @Post()
  create(@Body() dto: CreateComplaintDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.create(user.id, user.email, dto)
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listForCustomer(user.id)
  }

  @Get(':caseNumber')
  findOne(@Param('caseNumber') caseNumber: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.getForCustomer(user.id, caseNumber)
  }
}

/** The staff complaints inbox. */
@Controller('staff/complaints')
@UsePipes(validation)
export class StaffComplaintsController {
  constructor(private readonly service: CustomerServiceService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listForStaff(user.id)
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.getForStaff(user.id, id)
  }

  @Patch(':id/status')
  setStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCaseStatusDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.setStatus(user.id, id, dto.status)
  }

  @Post(':id/notes')
  @HttpCode(201)
  addNote(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AddCaseNoteDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.addNote(user.id, id, dto.note)
  }
}

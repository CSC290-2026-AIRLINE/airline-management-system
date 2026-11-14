import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, UsePipes, ValidationPipe } from '@nestjs/common'
import { CurrentUser } from '@backend/auth/decorators/current-user.decorator'
import { Public } from '@backend/auth/decorators/public.decorator'
import type { AuthenticatedUser } from '@backend/auth/guards/jwt-auth.guard'
import { CustomerServiceService } from './customer-service.service'
import { CreateComplaintDto, CreateGuestComplaintDto } from './dto/create-complaint.dto'
import {
  AddCaseNoteDto,
  AssignCaseOwnerDto,
  DecideCompensationDto,
  UpdateCaseStatusDto,
  UpdateNotificationTemplateDto,
} from './dto/staff-actions.dto'

// Scoped to this module, like pricing's pipe: other teams' endpoints keep their own rules.
const validation = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })

/** The customer's complaints (both signed-in account and passenger without an account). */
@Controller('complaints')
@UsePipes(validation)
export class CustomerComplaintsController {
  constructor(private readonly service: CustomerServiceService) {}

  @Post()
  create(@Body() dto: CreateComplaintDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.create(user.id, user.email, dto)
  }

  /**
   * Public endpoint for "I'm a passenger without an account".
   * Verifies `booking_reference` + `surname` against `booking_passenger` and writes to `complaint_case` with `customer_id = NULL`.
   */
  @Public()
  @Post('guest')
  createGuest(@Body() dto: CreateGuestComplaintDto) {
    return this.service.createGuest(dto)
  }

  /**
   * Public endpoint for checking a case without an account.
   */
  @Public()
  @Get('guest/:caseNumber')
  findOneGuest(
    @Param('caseNumber') caseNumber: string,
    @Query('booking_reference') bookingReference?: string,
    @Query('surname') surname?: string,
  ) {
    return this.service.getGuestCase(caseNumber, bookingReference, surname)
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

  @Get('charts')
  getCharts(@CurrentUser() user: AuthenticatedUser) {
    return this.service.getChartsForStaff(user.id)
  }

  @Get('delivery-log')
  getDeliveryLog(@CurrentUser() user: AuthenticatedUser) {
    return this.service.getDeliveryLogForStaff(user.id)
  }

  @Get('templates')
  getTemplates(@CurrentUser() user: AuthenticatedUser) {
    return this.service.getTemplatesForStaff(user.id)
  }

  @Patch('templates/:code')
  updateTemplate(
    @Param('code') code: string,
    @Body() dto: UpdateNotificationTemplateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.updateTemplateForStaff(user.id, code, dto)
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.getForStaff(user.id, id)
  }

  @Patch(':id/assign')
  assignOwner(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignCaseOwnerDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.assignOwner(user.id, id, dto.ownerName)
  }

  @Patch(':id/status')
  setStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCaseStatusDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.setStatus(user.id, id, dto.status, dto.resolutionNote)
  }

  @Post(':id/notes')
  @HttpCode(201)
  addNote(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AddCaseNoteDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.addNote(user.id, id, dto.note)
  }

  @Post(':id/compensation')
  @HttpCode(201)
  decideCompensation(@Param('id', ParseUUIDPipe) id: string, @Body() dto: DecideCompensationDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.decideCompensation(user.id, id, dto)
  }
}

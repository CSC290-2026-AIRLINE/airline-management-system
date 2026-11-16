import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common'
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
import { CustomerServiceStaffGuard } from './guards/customer-service-staff.guard'
import { SupervisorOnly } from './decorators/supervisor-only.decorator'

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
   * Requires booking_reference + surname and verifies against booking_passenger.
   */
  @Public()
  @Post('guest')
  createGuest(@Body() dto: CreateGuestComplaintDto) {
    return this.service.createGuest(dto)
  }

  /**
   * Public endpoint for checking a case without an account.
   * Requires booking_reference + surname to match the booking_passenger on the case.
   */
  @Public()
  @Get('guest/:caseNumber')
  findOneGuest(
    @Param('caseNumber') caseNumber: string,
    @Query('booking_reference') bookingReference?: string,
    @Query('surname') surname?: string,
  ) {
    if (!bookingReference?.trim() || !surname?.trim()) {
      throw new BadRequestException('Booking reference and surname are required')
    }
    return this.service.getGuestCase(caseNumber, bookingReference.trim().toUpperCase(), surname.trim())
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listForCustomer(user.id)
  }

  @Get(':caseNumber')
  findOne(@Param('caseNumber') caseNumber: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.getForCustomer(user.id, caseNumber)
  }

  @Post(':caseNumber/reopen')
  @HttpCode(200)
  reopen(@Param('caseNumber') caseNumber: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.reopenForCustomer(user.id, caseNumber)
  }
}

/** The staff complaints inbox. Protected by CustomerServiceStaffGuard. */
@Controller('staff/complaints')
@UseGuards(CustomerServiceStaffGuard)
@UsePipes(validation)
export class StaffComplaintsController {
  constructor(private readonly service: CustomerServiceService) {}

  @Get('me')
  getMe(@CurrentUser() user: AuthenticatedUser) {
    return this.service.getCurrentStaff(user.id)
  }

  @Get('staff-members')
  getStaffMembers() {
    return this.service.getStaffMembers()
  }

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

  // Every CS staff member may read templates; only the supervisor edits them.
  @Get('templates')
  getTemplates(@CurrentUser() user: AuthenticatedUser) {
    return this.service.getTemplatesForStaff(user.id)
  }

  @SupervisorOnly()
  @Patch('templates/:code')
  updateTemplate(@Param('code') code: string, @Body() dto: UpdateNotificationTemplateDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.updateTemplateForStaff(user.id, code, dto)
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.getForStaff(user.id, id)
  }

  @SupervisorOnly()
  @Patch(':id/assign')
  assignOwner(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignCaseOwnerDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.assignOwner(user.id, id, dto.staffId)
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

  @SupervisorOnly()
  @Post(':id/compensation')
  @HttpCode(201)
  decideCompensation(@Param('id', ParseUUIDPipe) id: string, @Body() dto: DecideCompensationDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.decideCompensation(user.id, id, dto)
  }
}

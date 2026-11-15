import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Put, Post, Query, UsePipes } from '@nestjs/common'
import { CurrentUser } from '@backend/auth/decorators/current-user.decorator'
import type { AuthenticatedUser } from '@backend/auth/guards/jwt-auth.guard'
import { CreateFareClassDto } from './dto/create-fare-class.dto'
import { UpdateFareClassDto } from './dto/update-fare-class.dto'
import { UpdateFareRuleDto } from './dto/update-fare-rule.dto'
import { FareClassService } from './fare-class.service'
import { pricingValidationPipe } from '../pricing.pipes'

@Controller('staff/fare-classes')
@UsePipes(pricingValidationPipe)
export class FareClassController {
  constructor(private readonly fareClassService: FareClassService) {}

  @Get()
  findAll(@Query('include_inactive') includeInactive?: string) {
    return this.fareClassService.findAll(includeInactive === 'true')
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.fareClassService.findOne(id)
  }

  @Post()
  create(@Body() dto: CreateFareClassDto, @CurrentUser() user: AuthenticatedUser) {
    return this.fareClassService.create(dto, user.id)
  }

  @Put(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateFareClassDto, @CurrentUser() user: AuthenticatedUser) {
    return this.fareClassService.update(id, dto, user.id)
  }

  @Get(':id/rule')
  findRule(@Param('id', ParseUUIDPipe) id: string) {
    return this.fareClassService.findRule(id)
  }

  @Put(':id/rule')
  updateRule(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateFareRuleDto, @CurrentUser() user: AuthenticatedUser) {
    return this.fareClassService.updateRule(id, dto, user.id)
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.fareClassService.remove(id, user.id)
  }
}

// Any signed-in caller: the active classes with their restrictions.
@Controller('fare-classes')
@UsePipes(pricingValidationPipe)
export class PublicFareClassController {
  constructor(private readonly fareClassService: FareClassService) {}

  @Get()
  findAll() {
    return this.fareClassService.findAll(false)
  }
}

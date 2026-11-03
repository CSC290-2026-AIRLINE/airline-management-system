import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, UseFilters, UsePipes } from '@nestjs/common'
import { Public } from '@backend/auth/decorators/public.decorator'
import { CreateFareClassDto } from './dto/create-fare-class.dto'
import { UpdateFareClassDto } from './dto/update-fare-class.dto'
import { UpdateFareRuleDto } from './dto/update-fare-rule.dto'
import { FareClassService } from './fare-class.service'
import { PricingExceptionFilter } from '../pricing-exception.filter'
import { pricingValidationPipe } from '../pricing.validation'

@UsePipes(pricingValidationPipe)
@UseFilters(PricingExceptionFilter)
@Controller('staff/fare-classes')
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
  create(@Body() dto: CreateFareClassDto) {
    return this.fareClassService.create(dto)
  }

  @Put(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateFareClassDto) {
    return this.fareClassService.update(id, dto)
  }

  @Get(':id/rule')
  findRule(@Param('id', ParseUUIDPipe) id: string) {
    return this.fareClassService.findRule(id)
  }

  @Put(':id/rule')
  updateRule(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateFareRuleDto) {
    return this.fareClassService.updateRule(id, dto)
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.fareClassService.remove(id)
  }
}

// Public so the customer site can list the classes on sale before anyone signs in. Active classes only.
@UsePipes(pricingValidationPipe)
@UseFilters(PricingExceptionFilter)
@Controller('fare-classes')
export class PublicFareClassController {
  constructor(private readonly fareClassService: FareClassService) {}

  @Public()
  @Get()
  findAll() {
    return this.fareClassService.findAll()
  }
}

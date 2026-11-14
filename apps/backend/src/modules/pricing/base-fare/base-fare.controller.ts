import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Put, Post, Query, UsePipes } from '@nestjs/common'
import { CurrentUser } from '@backend/auth/decorators/current-user.decorator'
import type { AuthenticatedUser } from '@backend/auth/guards/jwt-auth.guard'
import { CreateBaseFareDto } from './dto/create-base-fare.dto'
import { ListBaseFaresDto } from './dto/list-base-fares.dto'
import { UpdateBaseFareDto } from './dto/update-base-fare.dto'
import { BaseFareService } from './base-fare.service'
import { pricingValidationPipe } from '../pricing.pipes'

@Controller('staff/base-fares')
@UsePipes(pricingValidationPipe)
export class BaseFareController {
  constructor(private readonly baseFareService: BaseFareService) {}

  @Get()
  findAll(@Query() filter: ListBaseFaresDto) {
    return this.baseFareService.findAll(filter)
  }

  // Declared before ':id' so the path is not read as an ID.
  @Get('route-options')
  findRouteOptions() {
    return this.baseFareService.findRouteOptions()
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.baseFareService.findOne(id)
  }

  @Post()
  create(@Body() dto: CreateBaseFareDto, @CurrentUser() user: AuthenticatedUser) {
    return this.baseFareService.create(dto, user.id)
  }

  @Put(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBaseFareDto, @CurrentUser() user: AuthenticatedUser) {
    return this.baseFareService.update(id, dto, user.id)
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.baseFareService.remove(id, user.id)
  }
}

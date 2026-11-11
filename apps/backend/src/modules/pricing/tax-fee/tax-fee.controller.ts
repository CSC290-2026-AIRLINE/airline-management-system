import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Put, Post, Query, UsePipes } from '@nestjs/common'
import { CurrentUser } from '@backend/auth/decorators/current-user.decorator'
import type { AuthenticatedUser } from '@backend/auth/guards/jwt-auth.guard'
import { CreateTaxFeeDto } from './dto/create-tax-fee.dto'
import { UpdateTaxFeeDto } from './dto/update-tax-fee.dto'
import { TaxFeeService } from './tax-fee.service'
import { pricingValidationPipe } from '../pricing.pipes'

@Controller('staff/tax-fees')
@UsePipes(pricingValidationPipe)
export class TaxFeeController {
  constructor(private readonly taxFeeService: TaxFeeService) {}

  @Get()
  findAll(@Query('include_inactive') includeInactive?: string) {
    return this.taxFeeService.findAll(includeInactive === 'true')
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.taxFeeService.findOne(id)
  }

  @Post()
  create(@Body() dto: CreateTaxFeeDto, @CurrentUser() user: AuthenticatedUser) {
    return this.taxFeeService.create(dto, user.id)
  }

  @Put(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTaxFeeDto, @CurrentUser() user: AuthenticatedUser) {
    return this.taxFeeService.update(id, dto, user.id)
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.taxFeeService.remove(id, user.id)
  }
}

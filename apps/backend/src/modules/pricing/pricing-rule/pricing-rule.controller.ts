import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Put, Post, Query, UsePipes } from '@nestjs/common'
import { CurrentUser } from '@backend/auth/decorators/current-user.decorator'
import type { AuthenticatedUser } from '@backend/auth/guards/jwt-auth.guard'
import { CreatePricingRuleDto } from './dto/create-pricing-rule.dto'
import { ListPricingRulesDto } from './dto/list-pricing-rules.dto'
import { ReorderPricingRulesDto } from './dto/reorder-pricing-rules.dto'
import { SimulatePriceDto } from './dto/simulate-price.dto'
import { UpdatePricingRuleDto } from './dto/update-pricing-rule.dto'
import { PricingRuleService } from './pricing-rule.service'
import { PricingSimulatorService } from './pricing-simulator.service'
import { pricingValidationPipe } from '../pricing.pipes'

@Controller('staff/pricing-rules')
@UsePipes(pricingValidationPipe)
export class PricingRuleController {
  constructor(private readonly pricingRuleService: PricingRuleService) {}

  @Get()
  findAll(@Query() filter: ListPricingRulesDto) {
    return this.pricingRuleService.findAll(filter)
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.pricingRuleService.findOne(id)
  }

  @Post()
  create(@Body() dto: CreatePricingRuleDto, @CurrentUser() user: AuthenticatedUser) {
    return this.pricingRuleService.create(dto, user.id)
  }

  @Put(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePricingRuleDto, @CurrentUser() user: AuthenticatedUser) {
    return this.pricingRuleService.update(id, dto, user.id)
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.pricingRuleService.remove(id, user.id)
  }
}

// Returns the group's rules in their new order, for the drag-and-drop list.
@Controller('staff/pricing-rule-order')
@UsePipes(pricingValidationPipe)
export class PricingRuleOrderController {
  constructor(private readonly pricingRuleService: PricingRuleService) {}

  @Put()
  reorder(@Body() dto: ReorderPricingRulesDto, @CurrentUser() user: AuthenticatedUser) {
    return this.pricingRuleService.reorder(dto, user.id)
  }
}

// Dry run for the Price simulator panel: saves nothing.
@Controller('staff/pricing-simulations')
@UsePipes(pricingValidationPipe)
export class PricingSimulationController {
  constructor(private readonly pricingSimulatorService: PricingSimulatorService) {}

  @Post()
  @HttpCode(200)
  simulate(@Body() dto: SimulatePriceDto) {
    return this.pricingSimulatorService.simulate(dto)
  }
}

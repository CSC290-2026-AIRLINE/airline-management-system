import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common'
import { CreatePricingRuleDto } from './dto/create-pricing-rule.dto'
import { ListPricingRulesDto } from './dto/list-pricing-rules.dto'
import { ReorderPricingRulesDto } from './dto/reorder-pricing-rules.dto'
import { SimulatePriceDto } from './dto/simulate-price.dto'
import { UpdatePricingRuleDto } from './dto/update-pricing-rule.dto'
import { PricingRuleService } from './pricing-rule.service'
import { PricingSimulatorService } from './pricing-simulator.service'

@Controller('staff/pricing-rules')
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
  create(@Body() dto: CreatePricingRuleDto) {
    return this.pricingRuleService.create(dto)
  }

  @Put(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePricingRuleDto) {
    return this.pricingRuleService.update(id, dto)
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.pricingRuleService.remove(id)
  }
}

// Its own resource in the spec: the order of one group's rules. Returns them in their new order, for the drag-and-drop list.
@Controller('staff/pricing-rule-order')
export class PricingRuleOrderController {
  constructor(private readonly pricingRuleService: PricingRuleService) {}

  @Put()
  reorder(@Body() dto: ReorderPricingRulesDto) {
    return this.pricingRuleService.reorder(dto)
  }
}

// Dry run for the Price simulator panel: saves nothing, so 200 rather than 201.
@Controller('staff/pricing-simulations')
export class PricingSimulationController {
  constructor(private readonly pricingSimulatorService: PricingSimulatorService) {}

  @Post()
  @HttpCode(200)
  simulate(@Body() dto: SimulatePriceDto) {
    return this.pricingSimulatorService.simulate(dto)
  }
}

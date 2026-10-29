import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common'
import { CreateTaxFeeDto } from './dto/create-tax-fee.dto'
import { UpdateTaxFeeDto } from './dto/update-tax-fee.dto'
import { TaxFeeService } from './tax-fee.service'

@Controller('staff/tax-fees')
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
  create(@Body() dto: CreateTaxFeeDto) {
    return this.taxFeeService.create(dto)
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTaxFeeDto) {
    return this.taxFeeService.update(id, dto)
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.taxFeeService.remove(id)
  }
}

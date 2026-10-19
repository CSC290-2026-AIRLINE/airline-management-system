import { Body, Controller, Delete, Get, HttpCode, Param, Put, Query, UseGuards } from '@nestjs/common'
import { ApiErrorException } from '../common/api-error'
import { StaffGuard } from '../common/staff.guard'
import { SuppliersService, type SupplierInput } from './suppliers.service'

function parseInput(body: unknown): SupplierInput {
  if (typeof body !== 'object' || body === null) {
    throw new ApiErrorException('SUPPLIER_INVALID', 'Body must be a JSON object.', 400)
  }
  const b = body as Record<string, unknown>
  if (typeof b.name !== 'string') throw new ApiErrorException('SUPPLIER_INVALID', 'name is required.', 400)
  if (typeof b.airportCode !== 'string') throw new ApiErrorException('SUPPLIER_INVALID', 'airportCode is required.', 400)
  const contact = typeof b.contact === 'string' ? b.contact : null
  const isActive = typeof b.isActive === 'boolean' ? b.isActive : true
  return { name: b.name, airportCode: b.airportCode, contact, isActive }
}

function parsePatch(body: unknown): Partial<SupplierInput> {
  if (typeof body !== 'object' || body === null) {
    throw new ApiErrorException('SUPPLIER_INVALID', 'Body must be a JSON object.', 400)
  }
  const b = body as Record<string, unknown>
  const out: Partial<SupplierInput> = {}
  if (b.name !== undefined) {
    if (typeof b.name !== 'string') throw new ApiErrorException('SUPPLIER_INVALID', 'name must be a string.', 400)
    out.name = b.name
  }
  if (b.airportCode !== undefined) {
    if (typeof b.airportCode !== 'string') throw new ApiErrorException('SUPPLIER_INVALID', 'airportCode must be a string.', 400)
    out.airportCode = b.airportCode
  }
  if (b.contact !== undefined) {
    out.contact = typeof b.contact === 'string' ? b.contact : null
  }
  if (b.isActive !== undefined) {
    if (typeof b.isActive !== 'boolean') throw new ApiErrorException('SUPPLIER_INVALID', 'isActive must be a boolean.', 400)
    out.isActive = b.isActive
  }
  return out
}

@Controller('staff/suppliers')
@UseGuards(StaffGuard)
export class SuppliersController {
  constructor(private readonly suppliers: SuppliersService) {}

  @Get()
  async list(@Query('airportCode') airportCode?: string) {
    return this.suppliers.list(airportCode)
  }

  @Put()
  async create(@Body() body: unknown) {
    return this.suppliers.create(parseInput(body))
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() body: unknown) {
    return this.suppliers.update(id, parsePatch(body))
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    await this.suppliers.remove(id)
  }
}

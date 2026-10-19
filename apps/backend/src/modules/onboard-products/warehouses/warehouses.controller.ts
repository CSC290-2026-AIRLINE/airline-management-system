import { Body, Controller, Delete, Get, HttpCode, Param, Put, UseGuards } from '@nestjs/common'
import { ApiErrorException } from '../common/api-error'
import { StaffGuard } from '../common/staff.guard'
import { WarehousesService, type WarehouseInput } from './warehouses.service'

function parseInput(body: unknown): WarehouseInput {
  if (typeof body !== 'object' || body === null) {
    throw new ApiErrorException('WAREHOUSE_INVALID', 'Body must be a JSON object.', 400)
  }
  const b = body as Record<string, unknown>
  if (typeof b.code !== 'string') throw new ApiErrorException('WAREHOUSE_INVALID', 'code is required.', 400)
  if (typeof b.name !== 'string') throw new ApiErrorException('WAREHOUSE_INVALID', 'name is required.', 400)
  if (typeof b.airportCode !== 'string') throw new ApiErrorException('WAREHOUSE_INVALID', 'airportCode is required.', 400)
  return { code: b.code, name: b.name, airportCode: b.airportCode }
}

function parsePatch(body: unknown): Partial<WarehouseInput> {
  if (typeof body !== 'object' || body === null) {
    throw new ApiErrorException('WAREHOUSE_INVALID', 'Body must be a JSON object.', 400)
  }
  const b = body as Record<string, unknown>
  const out: Partial<WarehouseInput> = {}
  if (b.code !== undefined) {
    if (typeof b.code !== 'string') throw new ApiErrorException('WAREHOUSE_INVALID', 'code must be a string.', 400)
    out.code = b.code
  }
  if (b.name !== undefined) {
    if (typeof b.name !== 'string') throw new ApiErrorException('WAREHOUSE_INVALID', 'name must be a string.', 400)
    out.name = b.name
  }
  if (b.airportCode !== undefined) {
    if (typeof b.airportCode !== 'string') throw new ApiErrorException('WAREHOUSE_INVALID', 'airportCode must be a string.', 400)
    out.airportCode = b.airportCode
  }
  return out
}

@Controller('staff/warehouses')
@UseGuards(StaffGuard)
export class WarehousesController {
  constructor(private readonly warehouses: WarehousesService) {}

  @Get()
  async list() {
    return this.warehouses.list()
  }

  @Put()
  async create(@Body() body: unknown) {
    return this.warehouses.create(parseInput(body))
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() body: unknown) {
    return this.warehouses.update(id, parsePatch(body))
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    await this.warehouses.remove(id)
  }
}
